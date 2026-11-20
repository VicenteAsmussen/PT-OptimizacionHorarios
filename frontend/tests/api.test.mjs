import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer as crearServidorHttp } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer, loadConfigFromFile, transformWithEsbuild } from "./soporte/vite.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));

// Inyecta configuración sintética en el cliente real sin leer archivos de entorno de la aplicación.
async function cargarApi(entorno = {}) {
  const fuente = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  const { code } = await transformWithEsbuild(fuente.replaceAll("import.meta.env", JSON.stringify(entorno)), "api.ts", { loader: "ts" });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

test("usa el mismo origen para JSON, formularios y archivos sin cambiar sus opciones", async () => {
  const cliente = await cargarApi();
  const anterior = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return new Response(JSON.stringify({ correcto: true }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    assert.deepEqual(await cliente.api("/auth/login", { method: "POST", body: '{"prueba":true}' }), { correcto: true });
    assert.equal(llamadas[0].url, "/api/auth/login");
    assert.equal(llamadas[0].opciones.method, "POST");
    assert.equal(llamadas[0].opciones.body, '{"prueba":true}');
    assert.equal(llamadas[0].opciones.credentials, "include");
    assert.equal(llamadas[0].opciones.headers.get("Content-Type"), "application/json");
    const formulario = new FormData();
    formulario.append("archivo", new Blob(["datos"]), "prueba.xlsx");
    const { signal } = new AbortController();
    await cliente.api("importar", { method: "POST", body: formulario, signal });
    assert.equal(llamadas[1].url, "/api/importar");
    assert.equal(llamadas[1].opciones.body, formulario);
    assert.equal(llamadas[1].opciones.signal, signal);
    assert.equal(llamadas[1].opciones.headers.has("Content-Type"), false);
    assert.ok(await cliente.apiArchivo("salas/exportar?soloPendientes=true", signal) instanceof Blob);
    assert.equal(llamadas[2].url, "/api/salas/exportar?soloPendientes=true");
    assert.equal(llamadas[2].opciones.credentials, "include");
    assert.equal(llamadas[2].opciones.signal, signal);
  } finally { globalThis.fetch = anterior; }
});

test("conserva la URL de API explícita, los errores y las respuestas vacías", async () => {
  const cliente = await cargarApi({ VITE_API_URL: "https://api.example.test/api/" });
  const anterior = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => { urls.push(url); return new Response(null, { status: 204 }); };
  try {
    assert.equal(await cliente.api("/auth/logout", { method: "POST" }), undefined);
    await cliente.apiArchivo("/salas/exportar");
    assert.deepEqual(urls, ["https://api.example.test/api/auth/logout", "https://api.example.test/api/salas/exportar"]);
    globalThis.fetch = async () => new Response('{"message":"Sin sesión"}', { status: 401 });
    await assert.rejects(cliente.api("auth/me"), error => error instanceof cliente.ApiError && error.status === 401 && error.message === "Sin sesión");
    await assert.rejects(cliente.apiArchivo("exportar"), error => error instanceof cliente.ApiError && error.status === 401);
  } finally { globalThis.fetch = anterior; }
});

test("Vite reenvía /api sin quitar rutas, cookies, formularios ni archivos", async () => {
  // El destino simulado reemplaza el puerto de desarrollo, ambos servidores usan direcciones locales y puertos efímeros.
  const configuracion = await loadConfigFromFile({ command: "serve", mode: "test" }, join(raiz, "vite.config.ts"));
  assert.equal(configuracion.config.server.proxy?.["/api"]?.target, "http://127.0.0.1:3000");
  const solicitudes = [];
  const destino = crearServidorHttp(async (peticion, respuesta) => {
    let cuerpo = "";
    for await (const fragmento of peticion) cuerpo += fragmento;
    solicitudes.push({ ruta: peticion.url, metodo: peticion.method, cookie: peticion.headers.cookie, tipo: peticion.headers["content-type"], cuerpo });
    respuesta.setHeader("Set-Cookie", "auth_token=sesion-sintetica; Path=/; HttpOnly; SameSite=Lax");
    respuesta.end(Buffer.from([0, 1, 2, 255]));
  });
  const cache = await mkdtemp(join(tmpdir(), "prueba-proxy-vite-"));
  let servidor;
  try {
    await new Promise(resolver => destino.listen(0, "127.0.0.1", resolver));
    servidor = await createServer({
      ...configuracion.config, root: raiz, configFile: false, cacheDir: cache, logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, proxy: { "/api": { ...configuracion.config.server.proxy["/api"], target: `http://127.0.0.1:${destino.address().port}` } } },
    });
    await servidor.listen();
    const origen = `http://127.0.0.1:${servidor.httpServer.address().port}`;
    const respuesta = await fetch(`${origen}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"prueba":true}' });
    assert.equal(respuesta.status, 200);
    assert.match(respuesta.headers.get("set-cookie"), /auth_token=sesion-sintetica/);
    const formulario = new FormData();
    formulario.append("archivo", new Blob(["datos"]), "prueba.xlsx");
    await fetch(`${origen}/api/salas/importar`, { method: "POST", body: formulario, headers: { Cookie: "auth_token=sesion-sintetica" } });
    const archivo = await fetch(`${origen}/api/salas/exportar?soloPendientes=true`, { headers: { Cookie: "auth_token=sesion-sintetica" } });
    assert.deepEqual([...new Uint8Array(await archivo.arrayBuffer())], [0, 1, 2, 255]);
    assert.deepEqual(solicitudes.map(({ ruta }) => ruta), ["/api/auth/login", "/api/salas/importar", "/api/salas/exportar?soloPendientes=true"]);
    assert.equal(solicitudes[0].cuerpo, '{"prueba":true}');
    assert.equal(solicitudes[0].metodo, "POST");
    assert.match(solicitudes[1].tipo, /^multipart\/form-data; boundary=/);
    assert.match(solicitudes[1].cuerpo, /prueba.xlsx/);
    assert.equal(solicitudes[2].cookie, "auth_token=sesion-sintetica");
  } finally {
    await servidor?.close();
    await new Promise(resolver => destino.close(resolver));
    await rm(cache, { recursive: true, force: true });
  }
});
