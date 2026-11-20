import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { once } from "node:events";
import type { Server } from "node:http";
import request from "supertest";
import solicitudApi from "./soporte/solicitud-api.js";

const estado = vi.hoisted(() => ({
  usuario: { id: 7, nombre: "Cuenta sintética", correo: "cuenta@example.test", rol: "secretaria", versionSesion: 0, clave: "hash-sintetico" },
  importar: vi.fn(), importarSalas: vi.fn(), importarResultado: vi.fn(),
}));
vi.mock("../src/config/env.js", () => ({ env: {
  NODE_ENV: "production", CLIENT_URL: "http://127.0.0.1", PORT: 3000,
  JWT_SECRET: "clave-sintetica-http-al-menos-32-bytes", JWT_EXPIRES_IN: "8h",
} }));
vi.mock("../src/config/db.js", () => ({ db: {} }));
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: {
  findById: vi.fn(async () => estado.usuario),
  findByCorreo: vi.fn(async () => ({ ...estado.usuario, clave: "hash-sintetico" })),
} }));
vi.mock("../src/utils/password.js", () => ({ comparePassword: vi.fn(async () => true) }));
vi.mock("../src/services/horarios.service.js", () => ({ horariosService: {
  importarExcelExternos: estado.importar, importarExcelSalas: estado.importarSalas,
} }));
vi.mock("../src/services/resultados-horarios.service.js", () => ({ resultadosHorariosService: {
  importarSalas: estado.importarResultado,
} }));

let servidor: Server;
const origen = "http://127.0.0.1";
const credenciales = { correo: "cuenta@example.test", clave: "clave-sintetica" };
const cabeceraCsrf = { "X-CSRF-Protection": "1", Origin: origen };
const rutaExcel = "/api/horarios-asignaturas/excel/externos/importar?planificacionSemestreId=9&departamentoId=4";

beforeAll(async () => {
  const { app } = await import("../src/app.js");
  servidor = app.listen(0, "127.0.0.1");
  await once(servidor, "listening");
});
afterAll(async () => { if (servidor) await new Promise<void>((resolver, rechazar) => servidor.close(error => error ? rechazar(error) : resolver())); });
beforeEach(() => {
  vi.clearAllMocks();
  estado.usuario.rol = "secretaria";
  estado.importar.mockResolvedValue({ errores: [], horariosCreados: 1 });
  estado.importarSalas.mockResolvedValue({ errores: [] });
});

async function iniciarSesion() {
  const cliente = request.agent(servidor);
  const entrada = await cliente.post("/api/auth/login").set(cabeceraCsrf).send(credenciales);
  expect(entrada.status).toBe(200);
  return { cliente, entrada };
}

it("mantiene la sesión por cookie en HTTP productivo hasta logout y luego exige autenticación", async () => {
  const { cliente, entrada } = await iniciarSesion();
  for (let consulta = 0; consulta < 2; consulta++) {
    const respuesta = await cliente.get("/api/auth/me");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.id).toBe(7);
  }
  const salida = await cliente.post("/api/auth/logout").set(cabeceraCsrf);
  expect(salida.status).toBe(200);
  for (const respuesta of [entrada, salida]) {
    const cookie = respuesta.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  }
  expect(salida.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970");
  expect((await cliente.get("/api/auth/me")).status).toBe(401);
});

it.each(["POST", "PUT", "PATCH", "DELETE"])("rechaza %s sin cabecera CSRF antes de rutas, JSON o efectos", async metodo => {
  const respuesta = await request(servidor)[metodo.toLowerCase() as "post"]("/api/auth/logout")
    .set("Content-Type", "application/json").send("{json inválido");
  expect(respuesta.status).toBe(403);
  expect(respuesta.body).toEqual({ status: "error", statusCode: 403, message: "Solicitud rechazada por protección CSRF." });
  expect(respuesta.headers["set-cookie"]).toBeUndefined();
});

it.each([
  { Origin: "http://ajeno.invalid" }, { Origin: "null" },
  { Origin: "http://127.0.0.1.ajeno.invalid" }, { Origin: "http://127.0.0.1:4444" },
  { Origin: "http://127.0.0.1/ruta" }, { Origin: "http://127.0.0.1", "Sec-Fetch-Site": "cross-site" },
])("rechaza logout de origen ajeno o contexto cross-site %j sin borrar sesión", async cabeceras => {
  const { cliente } = await iniciarSesion();
  const antes = JSON.stringify(estado.usuario);
  const respuesta = await cliente.post("/api/auth/logout").set({ "X-CSRF-Protection": "1", ...cabeceras });
  expect(respuesta.status).toBe(403);
  expect(respuesta.headers["set-cookie"]).toBeUndefined();
  expect(JSON.stringify(estado.usuario)).toBe(antes);
  expect((await cliente.get("/api/auth/me")).status).toBe(200);
});

it("protege login de formularios simples y rechaza valores CSRF incorrectos", async () => {
  for (const cabeceras of [{ Origin: origen }, { ...cabeceraCsrf, "X-CSRF-Protection": "otro" }]) {
    const respuesta = await request(servidor).post("/api/auth/login").set(cabeceras).type("form").send(credenciales);
    expect(respuesta.status).toBe(403);
    expect(respuesta.headers["set-cookie"]).toBeUndefined();
  }
});

it.each([
  rutaExcel,
  "/api/horarios-asignaturas/excel/salas/importar?planificacionSemestreId=9",
  "/api/resultados-horarios/9/salas/importar",
])("rechaza Excel multipart sin CSRF o de origen ajeno antes de importar: %s", async ruta => {
  const { cliente } = await iniciarSesion();
  for (const cabeceras of [{ Origin: origen }, { "X-CSRF-Protection": "1", Origin: "http://ajeno.invalid" }]) {
    const respuesta = await cliente.post(ruta).set(cabeceras).attach("archivo", Buffer.from("datos sintéticos"), "horarios.xlsx");
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.message).toBe("Solicitud rechazada por protección CSRF.");
  }
  expect(estado.importar).not.toHaveBeenCalled();
  expect(estado.importarSalas).not.toHaveBeenCalled();
  expect(estado.importarResultado).not.toHaveBeenCalled();
});

it("permite multipart legítimo sin Fetch Metadata y conserva la identidad al importar", async () => {
  const { cliente } = await iniciarSesion();
  const respuesta = await cliente.post(rutaExcel).set(cabeceraCsrf).attach("archivo", Buffer.from("datos sintéticos"), "horarios.xlsx");
  expect(respuesta.status).toBe(201);
  expect(estado.importar).toHaveBeenCalledExactlyOnceWith(9, 4, Buffer.from("datos sintéticos"), { id: 7, rol: "secretaria" });
});

it("conserva permisos de rol y autentica al cliente no navegador con cabecera explícita", async () => {
  const { cliente } = await iniciarSesion();
  estado.usuario.rol = "profesor";
  expect((await cliente.post(rutaExcel).set(cabeceraCsrf).attach("archivo", Buffer.from("datos"), "horarios.xlsx")).status).toBe(403);
  expect(estado.importar).not.toHaveBeenCalled();
  expect((await request(servidor).post("/api/auth/logout").set("X-CSRF-Protection", "1")).status).toBe(200);
  expect((await request(servidor).get("/api/auth/me")).status).toBe(401);
  expect((await request(servidor).options("/api/auth/logout").set({ Origin: origen, "Access-Control-Request-Method": "POST" })).status).toBe(204);
});

it("no convierte una API inexistente en HTML ni redirige las lecturas a HTTPS", async () => {
  const respuesta = await request(servidor).get("/api/no-existe").accept("html");
  expect(respuesta.status).toBe(404);
  expect(respuesta.type).toBe("application/json");
  expect(respuesta.headers.location).toBeUndefined();
});

it("el cliente de escenarios funcionales conserva la cabecera CSRF y la sesión del agente", async () => {
  const cliente = solicitudApi.agent(servidor);
  expect((await cliente.post("/api/auth/login").send(credenciales)).status).toBe(200);
  expect((await cliente.get("/api/auth/me")).status).toBe(200);
  expect((await cliente.post("/api/auth/logout")).status).toBe(200);
  expect((await cliente.get("/api/auth/me")).status).toBe(401);
  expect((await solicitudApi(servidor).post("/api/auth/logout")).status).toBe(200);
});
