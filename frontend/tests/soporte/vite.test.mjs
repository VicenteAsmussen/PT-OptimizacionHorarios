import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { configuracionAislada, createServer, loadConfigFromFile } from "./vite.mjs";

test("el arnés desactiva entorno, WebSocket y vigilancia sin perder opciones del ensayo", () => {
  const configuracion = configuracionAislada({ server: { middlewareMode: true, port: 0 }, appType: "custom" }, "cache-externa");
  assert.equal(configuracion.envDir, false);
  assert.equal(configuracion.configLoader, "runner");
  assert.equal(configuracion.cacheDir, "cache-externa");
  assert.equal(configuracion.optimizeDeps.noDiscovery, true);
  assert.deepEqual(configuracion.optimizeDeps.include, []);
  assert.equal(configuracion.server.ws, false);
  assert.equal(configuracion.server.hmr, false);
  assert.equal(configuracion.server.watch, null);
  assert.equal(configuracion.server.host, "127.0.0.1");
  assert.equal(configuracion.server.middlewareMode, true);
  assert.equal(configuracion.server.port, 0);
  assert.equal(configuracion.appType, "custom");
});

test("carga la configuración real sin paquete temporal y cierra el servidor SSR con caché externa", async () => {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const cargada = await loadConfigFromFile({ command: "serve", mode: "test" }, `${raiz}/vite.config.ts`);
  assert.equal(cargada.config.server.proxy["/api"].target, "http://127.0.0.1:3000");
  const servidor = await createServer({ root: raiz, server: { middlewareMode: true }, appType: "custom" });
  const cache = servidor.config.cacheDir;
  try {
    assert.ok(isAbsolute(cache));
    assert.ok(relative(raiz, cache).startsWith(".."));
    assert.ok(!relative(tmpdir(), cache).startsWith(".."));
    assert.equal(servidor.config.envDir, false);
    assert.equal(servidor.config.server.ws, false);
    assert.equal(servidor.httpServer, null);
    assert.ok((await servidor.ssrLoadModule("/src/lib/focoTabla.ts")));
  } finally { await servidor.close(); }
  await assert.rejects(access(cache), { code: "ENOENT" });
});
