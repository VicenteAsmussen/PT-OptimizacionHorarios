import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";
import { once } from "node:events";

const estado = vi.hoisted(() => ({ usuario: undefined as any, buscar: vi.fn(), comparar: vi.fn() }));
const secreto = "clave-sintetica-autenticacion-pruebas";
vi.mock("../src/config/env.js", () => ({ env: {
  JWT_SECRET: "clave-sintetica-autenticacion-pruebas", JWT_EXPIRES_IN: "8h", NODE_ENV: "test",
} }));
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: {
  findByCorreo: vi.fn(async () => estado.usuario && { ...estado.usuario }),
  findById: estado.buscar,
} }));
vi.mock("../src/utils/password.js", () => ({ comparePassword: estado.comparar }));
vi.mock("../src/config/db.js", () => ({ db: {} }));
import { authRouter } from "../src/routes/auth.routes.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { authorizeRoles } from "../src/middlewares/roles.middleware.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { env } from "../src/config/env.js";

const aplicacion = express();
aplicacion.use(express.json(), cookieParser());
aplicacion.use("/auth", authRouter);
aplicacion.get("/privado", authenticate, (peticion, respuesta) => respuesta.json({ usuario: peticion.user }));
aplicacion.get("/admin", authenticate, authorizeRoles("admin"), (_peticion, respuesta) => respuesta.sendStatus(204));
aplicacion.use(errorHandler);
const credenciales = { correo: "cuenta@example.test", clave: "clave-prueba" };
const rechazo = { status: "error", statusCode: 401, message: "No autorizado: Token inválido o expirado" };
const cierre = { status: "success", message: "Sesión cerrada correctamente" };
const publico = { id: 1, nombre: "Cuenta", correo: credenciales.correo, rol: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  env.JWT_EXPIRES_IN = "8h";
  env.NODE_ENV = "test";
  estado.usuario = { ...publico, clave: "hash", versionSesion: 0 };
  estado.buscar.mockImplementation(async () => estado.usuario && { ...estado.usuario });
  estado.comparar.mockImplementation(async (clave) => clave === credenciales.clave);
});
afterEach(() => vi.restoreAllMocks());

async function iniciar() {
  const respuesta = await request(aplicacion).post("/auth/login").send(credenciales);
  expect(respuesta.status).toBe(200);
  const cookie = respuesta.headers["set-cookie"][0].split(";")[0];
  const token = decodeURIComponent(cookie.slice("auth_token=".length));
  return { respuesta, cookie, token, claims: jwt.decode(token) as jwt.JwtPayload };
}
async function exigirRechazo(token: string) {
  const antes = JSON.stringify(estado.usuario);
  const respuesta = await request(aplicacion).get("/privado").auth(token, { type: "bearer" });
  expect(respuesta.status).toBe(401);
  expect(respuesta.body).toEqual(rechazo);
  expect(JSON.stringify(estado.usuario)).toBe(antes);
}

describe("JWT y cookies sin sesiones persistidas", () => {
  it("login emite JWT de ocho horas sin sid y conserva cookie HttpOnly y usuario público", async () => {
    const acceso = await iniciar();
    expect(acceso.respuesta.body).toEqual({ status: "success", data: { user: publico } });
    expect(acceso.claims.versionSesion).toBe(0);
    expect(acceso.claims).not.toHaveProperty("sid");
    expect(acceso.claims).not.toHaveProperty("clave");
    expect(acceso.claims.exp! - acceso.claims.iat!).toBe(8 * 3600);
    const cabecera = acceso.respuesta.headers["set-cookie"][0];
    expect(cabecera).toContain("HttpOnly");
    expect(cabecera).toContain("SameSite=Lax");
    expect(cabecera).not.toContain("Secure");
    const segundos = Number(/Max-Age=(\d+)/.exec(cabecera)![1]);
    expect(segundos).toBeGreaterThanOrEqual(8 * 3600 - 2);
    expect(segundos).toBeLessThanOrEqual(8 * 3600);
    const actual = await request(aplicacion).get("/auth/me").set("Cookie", acceso.cookie);
    expect(actual.status).toBe(200);
    expect(actual.body).toEqual({ status: "success", data: publico });
    const privado = await request(aplicacion).get("/privado").auth(acceso.token, { type: "bearer" });
    expect(privado.status).toBe(200);
    expect(privado.body).toEqual({ usuario: publico });
  });

  it.each(["cookie", "bearer"])("logout %s borra cookie pero no revoca una copia del token ni otros accesos", async transporte => {
    const primera = await iniciar(), segunda = await iniciar();
    const antes = JSON.stringify(estado.usuario);
    estado.buscar.mockClear();
    const peticion = request(aplicacion).post("/auth/logout");
    if (transporte === "cookie") peticion.set("Cookie", primera.cookie);
    else peticion.auth(primera.token, { type: "bearer" });
    const respuesta = await peticion;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(cierre);
    expect(respuesta.headers["set-cookie"][0]).toContain("auth_token=;");
    expect(respuesta.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970");
    expect(estado.buscar).not.toHaveBeenCalled();
    expect(JSON.stringify(estado.usuario)).toBe(antes);
    for (const acceso of [primera, segunda]) {
      expect((await request(aplicacion).get("/privado").auth(acceso.token, { type: "bearer" })).status).toBe(200);
    }
  });

  it("la cookie respeta una duración configurada distinta sin extender el JWT", async () => {
    env.JWT_EXPIRES_IN = "2h";
    const acceso = await iniciar();
    expect(acceso.claims.exp! - acceso.claims.iat!).toBe(7200);
    const segundos = Number(/Max-Age=(\d+)/.exec(acceso.respuesta.headers["set-cookie"][0])![1]);
    expect(segundos).toBeGreaterThanOrEqual(7198);
    expect(segundos).toBeLessThanOrEqual(7200);
  });

  it("conserva Secure, HttpOnly y SameSite=None en producción, también al borrar la cookie", async () => {
    env.NODE_ENV = "production";
    // Las opciones se fijan al cargar el controlador, como en un arranque real.
    vi.resetModules();
    const { authRouter: rutasProduccion } = await import("../src/routes/auth.routes.js");
    const aplicacionProduccion = express();
    aplicacionProduccion.use(express.json(), cookieParser());
    aplicacionProduccion.use("/auth", rutasProduccion);
    aplicacionProduccion.use(errorHandler);
    const servidor = aplicacionProduccion.listen(0, "127.0.0.1");
    try {
      await once(servidor, "listening");
      const entrada = await request(servidor).post("/auth/login").send(credenciales);
      expect(entrada.status).toBe(200);
      expect(entrada.body).toEqual({ status: "success", data: { user: publico } });
      const cookie = entrada.headers["set-cookie"][0].split(";")[0];
      const token = decodeURIComponent(cookie.slice("auth_token=".length));
      const claims = jwt.decode(token) as jwt.JwtPayload;
      expect(claims.exp! - claims.iat!).toBe(8 * 3600);
      const salida = await request(servidor).post("/auth/logout").set("Cookie", cookie);
      expect(salida.status).toBe(200);
      expect(salida.body).toEqual(cierre);
      for (const cabecera of [entrada.headers["set-cookie"][0], salida.headers["set-cookie"][0]]) {
        expect(cabecera).toContain("HttpOnly");
        expect(cabecera).toContain("Secure");
        expect(cabecera).toContain("SameSite=None");
        expect(cabecera).toContain("Path=/");
      }
      expect(salida.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970");
      const consulta = await request(servidor).get("/auth/me").auth(token, { type: "bearer" });
      expect(consulta.status).toBe(200);
      expect(consulta.body).toEqual({ status: "success", data: publico });
    } finally {
      await new Promise<void>((resolver, rechazar) => servidor.close(error => error ? rechazar(error) : resolver()));
    }
  });

  it.each(["rol", "correo", "clave", "baja"])("rechaza tokens tras %s y no los revive al restaurar los datos", async cambio => {
    const { token } = await iniciar();
    if (cambio === "baja") estado.usuario = undefined;
    else {
      estado.usuario.versionSesion++;
      estado.usuario[cambio] = cambio === "rol" ? "profesor" : "otro";
    }
    await exigirRechazo(token);
    if (cambio !== "baja") {
      estado.usuario = { ...publico, clave: "hash", versionSesion: 2 };
      await exigirRechazo(token);
      expect((await request(aplicacion).get("/admin").auth((await iniciar()).token, { type: "bearer" })).status).toBe(204);
    }
  });

  it("no confía en el rol del JWT y devuelve el nombre vigente sin invalidar por cambio de nombre", async () => {
    const { token } = await iniciar();
    estado.usuario.nombre = "Nombre actual";
    const respuesta = await request(aplicacion).get("/privado").auth(token, { type: "bearer" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ usuario: { ...publico, nombre: "Nombre actual" } });
    estado.usuario.rol = "profesor";
    expect((await request(aplicacion).get("/admin").auth(token, { type: "bearer" })).status).toBe(403);
  });

  it.each([
    {}, { sid: "a".repeat(64) }, { versionSesion: -1 }, { versionSesion: "0" },
    { versionSesion: 0.5 }, { versionSesion: 0, id: "1" },
    { versionSesion: 0, rol: "otro" }, { versionSesion: 0, exp: 1 },
  ])("rechaza tokens antiguos o claims inválidos %j sin consultar usuarios", async cambios => {
    const token = jwt.sign({ ...publico, ...cambios }, secreto);
    await exigirRechazo(token);
    expect(estado.buscar).not.toHaveBeenCalled();
  });

  it("rechaza una firma ajena y el token al vencer sus ocho horas", async () => {
    const { token, claims } = await iniciar();
    await exigirRechazo(jwt.sign(claims, "otra-clave-sintetica"));
    const reloj = vi.spyOn(Date, "now").mockReturnValue(claims.exp! * 1000);
    await exigirRechazo(token);
    reloj.mockRestore();
  });

  it("login incorrecto conserva el contrato 401 y no emite cookie", async () => {
    const respuesta = await request(aplicacion).post("/auth/login").send({ ...credenciales, clave: "incorrecta" });
    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 401, message: "Credenciales inválidas" });
    expect(respuesta.headers["set-cookie"]).toBeUndefined();
  });

  it("rechaza login si cambió la versión durante la comparación de contraseña", async () => {
    estado.comparar.mockImplementationOnce(async () => { estado.usuario.versionSesion += 2; return true; });
    const respuesta = await request(aplicacion).post("/auth/login").send(credenciales);
    expect(respuesta.status).toBe(401);
    expect(respuesta.headers["set-cookie"]).toBeUndefined();
  });

  it.each(["login", "consulta"])("fallo de consulta durante %s devuelve 500 sin cookie de éxito", async operacion => {
    const { token } = await iniciar();
    vi.spyOn(console, "error").mockImplementation(() => {});
    estado.buscar.mockRejectedValueOnce(new Error("Fallo sintético de consulta"));
    const peticion = operacion === "consulta"
      ? request(aplicacion).get("/privado").auth(token, { type: "bearer" })
      : request(aplicacion).post("/auth/login").send(credenciales);
    const respuesta = await peticion;
    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 500, message: "Internal server error" });
    expect(respuesta.headers["set-cookie"]).toBeUndefined();
  });

  it.each([undefined, "invalido"])("logout %s es idempotente y no depende de la base", async token => {
    estado.buscar.mockRejectedValue(new Error("Base no disponible"));
    const peticion = request(aplicacion).post("/auth/logout");
    if (token) peticion.auth(token, { type: "bearer" });
    const respuesta = await peticion;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(cierre);
    expect(respuesta.headers["set-cookie"][0]).toContain("auth_token=;");
    expect(estado.buscar).not.toHaveBeenCalled();
  });
});
