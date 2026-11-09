import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";

const estado = vi.hoisted(() => ({
  usuario: undefined as any,
  sesiones: new Map<string, any>(),
  crear: vi.fn(), buscar: vi.fn(), revocar: vi.fn(), comparar: vi.fn(),
}));
vi.mock("../src/config/env.js", () => ({ env: {
  JWT_SECRET: "clave-sintetica-sesiones-pruebas", JWT_EXPIRES_IN: "1h", NODE_ENV: "test",
} }));
vi.mock("../src/config/db.js", () => ({ db: {} }));
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: {
  findByCorreo: vi.fn(async () => estado.usuario && { ...estado.usuario }),
  findById: vi.fn(async () => estado.usuario && { ...estado.usuario }),
} }));
vi.mock("../src/repositories/sesiones.repository.js", () => ({ sesionesRepository: {
  createConCredenciales: estado.crear, findById: estado.buscar, deleteById: estado.revocar,
} }));
vi.mock("../src/utils/password.js", () => ({ comparePassword: estado.comparar }));
import { authRouter } from "../src/routes/auth.routes.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

const aplicacion = express();
aplicacion.use(express.json(), cookieParser());
aplicacion.use("/auth", authRouter);
aplicacion.get("/privado", authenticate, (peticion, respuesta) => respuesta.json({ usuario: peticion.user }));
aplicacion.use(errorHandler);
const credenciales = { correo: "cuenta@example.test", clave: "clave-prueba" };
const rechazo = { status: "error", statusCode: 401, message: "No autorizado: Token inválido o expirado" };
const cierre = { status: "success", message: "Sesión cerrada correctamente" };

beforeEach(() => {
  vi.clearAllMocks();
  estado.usuario = { id: 1, nombre: "Cuenta", correo: credenciales.correo, rol: "admin", clave: "hash", versionSesion: 0 };
  estado.sesiones.clear();
  estado.comparar.mockImplementation(async (clave) => clave === credenciales.clave);
  estado.crear.mockImplementation(async (usuario, sesion) => {
    if (!estado.usuario || usuario.versionSesion !== estado.usuario.versionSesion) return false;
    estado.sesiones.set(sesion.id, { ...sesion });
    return true;
  });
  estado.buscar.mockImplementation(async (id) => {
    const sesion = estado.sesiones.get(id);
    return sesion && estado.usuario ? { ...sesion, usuario: { ...estado.usuario } } : undefined;
  });
  estado.revocar.mockImplementation(async (id, usuarioId) => {
    if (estado.sesiones.get(id)?.usuarioId === usuarioId) estado.sesiones.delete(id);
  });
});

async function iniciar() {
  const respuesta = await request(aplicacion).post("/auth/login").send(credenciales);
  expect(respuesta.status).toBe(200);
  const cookie = respuesta.headers["set-cookie"][0].split(";")[0];
  const token = decodeURIComponent(cookie.slice("auth_token=".length));
  return { respuesta, cookie, token, claims: jwt.decode(token) as jwt.JwtPayload };
}
async function exigirRechazo(token: string) {
  const antes = [...estado.sesiones.entries()];
  const respuesta = await request(aplicacion).get("/privado").auth(token, { type: "bearer" });
  expect(respuesta.status).toBe(401);
  expect(respuesta.body).toEqual(rechazo);
  expect([...estado.sesiones.entries()]).toEqual(antes);
}

describe("Sesiones persistentes por token mediante HTTP sin base real", () => {
  it("login conserva cookie y usuario público, crea sesión aleatoria con expiración JWT exacta", async () => {
    const primero = await iniciar();
    const segundo = await iniciar();
    expect(primero.respuesta.body).toEqual({ status: "success", data: { user: {
      id: 1, nombre: "Cuenta", correo: credenciales.correo, rol: "admin",
    } } });
    expect(primero.claims.sid).toMatch(/^[a-f0-9]{64}$/);
    expect(primero.claims).not.toHaveProperty("clave");
    expect(primero.claims).not.toHaveProperty("versionSesion");
    expect(segundo.claims.sid).not.toBe(primero.claims.sid);
    expect(estado.sesiones.size).toBe(2);
    expect(estado.sesiones.get(primero.claims.sid).expiraEn.getTime()).toBe(primero.claims.exp! * 1000);
    const actual = await request(aplicacion).get("/auth/me").set("Cookie", primero.cookie);
    expect(actual.status).toBe(200);
    expect(actual.body).toEqual({ status: "success", data: primero.respuesta.body.data.user });
    const privado = await request(aplicacion).get("/privado").auth(segundo.token, { type: "bearer" });
    expect(privado.status).toBe(200);
    expect(privado.body).toEqual({ usuario: primero.respuesta.body.data.user });
  });

  it.each(["cookie", "bearer"])("logout %s revoca solo la sesión presentada y no permite reutilizarla", async (transporte) => {
    const primera = await iniciar(), segunda = await iniciar();
    const peticion = request(aplicacion).post("/auth/logout");
    if (transporte === "cookie") peticion.set("Cookie", primera.cookie);
    else peticion.auth(primera.token, { type: "bearer" });
    const respuesta = await peticion;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(cierre);
    expect(respuesta.headers["set-cookie"][0]).toContain("auth_token=;");
    expect(estado.sesiones.size).toBe(1);
    expect(estado.sesiones.has(segunda.claims.sid)).toBe(true);
    await exigirRechazo(primera.token);
    expect((await request(aplicacion).get("/privado").auth(segunda.token, { type: "bearer" })).status).toBe(200);
    expect((await request(aplicacion).post("/auth/logout").auth(primera.token, { type: "bearer" })).body).toEqual(cierre);
    expect(estado.sesiones.size).toBe(1);
  });

  it.each(["rol", "baja", "clave"])("rechaza sesión tras %s y no recupera autoridad al volver al rol original", async (cambio) => {
    const { token } = await iniciar();
    if (cambio === "baja") estado.usuario = undefined;
    else {
      estado.usuario.versionSesion++;
      if (cambio === "rol") estado.usuario.rol = "profesor";
      else estado.usuario.clave = "otro-hash";
    }
    estado.sesiones.clear(); // Efecto atómico del repositorio, comprobado por separado.
    await exigirRechazo(token);
    if (cambio === "rol") {
      estado.usuario.rol = "admin";
      await exigirRechazo(token);
    }
    expect(estado.revocar).not.toHaveBeenCalled();
  });

  it("revalida el rol actual aunque una sesión exista", async () => {
    const { token } = await iniciar();
    estado.usuario.rol = "profesor";
    await exigirRechazo(token);
  });

  it.each(["ausente", "expirada", "otro-usuario", "otra-expiracion"])("rechaza persistencia %s sin alterar sesiones", async (caso) => {
    const { token, claims } = await iniciar();
    const sesion = estado.sesiones.get(claims.sid);
    if (caso === "ausente") estado.sesiones.clear();
    if (caso === "expirada") sesion.expiraEn = new Date(0);
    if (caso === "otro-usuario") sesion.usuarioId = 2;
    if (caso === "otra-expiracion") sesion.expiraEn = new Date(claims.exp! * 1000 + 1000);
    await exigirRechazo(token);
  });

  it.each([
    {}, { sid: "predecible" }, { sid: "a".repeat(64), id: "1" },
    { sid: "a".repeat(64), rol: "otro" }, { sid: "a".repeat(64), exp: 1 },
  ])("rechaza JWT antiguo o claims inválidos %j antes de consultar persistencia", async (cambios) => {
    const token = jwt.sign({ id: 1, nombre: "Cuenta", correo: credenciales.correo, rol: "admin", ...cambios },
      "clave-sintetica-sesiones-pruebas");
    await exigirRechazo(token);
    expect(estado.buscar).not.toHaveBeenCalled();
    expect(estado.crear).not.toHaveBeenCalled();
  });

  it("login incorrecto conserva el contrato 401 y no crea sesiones", async () => {
    const respuesta = await request(aplicacion).post("/auth/login").send({ ...credenciales, clave: "incorrecta" });
    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 401, message: "Credenciales inválidas" });
    expect(estado.sesiones.size).toBe(0);
    expect(estado.crear).not.toHaveBeenCalled();
  });

  it("no emite cookie si las credenciales cambian durante login, incluso tras volver al rol original", async () => {
    estado.comparar.mockImplementationOnce(async () => { estado.usuario.versionSesion += 2; return true; });
    const respuesta = await request(aplicacion).post("/auth/login").send(credenciales);
    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 401, message: "Credenciales inválidas" });
    expect(respuesta.headers["set-cookie"]).toBeUndefined();
    expect(estado.sesiones.size).toBe(0);
  });

  it.each(["login", "consulta", "logout"])("falla DB durante %s produce 500 sin éxito falso ni borrar cookie", async (operacion) => {
    const { token } = await iniciar();
    const antes = [...estado.sesiones.entries()];
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fallo = new Error("Fallo sintético de persistencia");
    if (operacion === "login") estado.crear.mockRejectedValueOnce(fallo);
    if (operacion === "consulta") estado.buscar.mockRejectedValueOnce(fallo);
    if (operacion === "logout") estado.revocar.mockRejectedValueOnce(fallo);
    const peticion = operacion === "consulta" ? request(aplicacion).get("/privado") : request(aplicacion).post(`/auth/${operacion}`);
    if (operacion === "login") peticion.send(credenciales);
    else peticion.auth(token, { type: "bearer" });
    const respuesta = await peticion;
    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 500, message: "Internal server error" });
    expect(respuesta.headers["set-cookie"]).toBeUndefined();
    expect([...estado.sesiones.entries()]).toEqual(antes);
    vi.restoreAllMocks();
  });

  it.each([undefined, "invalido"])("logout sin token válido %s sigue siendo idempotente", async (token) => {
    const { claims } = await iniciar();
    const peticion = request(aplicacion).post("/auth/logout");
    if (token) peticion.auth(token, { type: "bearer" });
    const respuesta = await peticion;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(cierre);
    expect(respuesta.headers["set-cookie"][0]).toContain("auth_token=;");
    expect(estado.revocar).not.toHaveBeenCalled();
    expect([...estado.sesiones.keys()]).toEqual([claims.sid]);
  });
});
