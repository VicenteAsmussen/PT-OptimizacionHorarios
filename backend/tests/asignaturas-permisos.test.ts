import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const dobles = vi.hoisted(() => ({
  verificar: vi.fn(),
  leer: vi.fn(),
  escribir: vi.fn(),
}));
vi.mock("../src/utils/jwt.js", () => ({ verifyToken: dobles.verificar }));
vi.mock("../src/controllers/asignaturas.controller.js", () => ({ asignaturasController: {
  getAll: dobles.leer, getByCodigo: dobles.leer,
  create: dobles.escribir, update: dobles.escribir, delete: dobles.escribir,
} }));
import { asignaturasRouter } from "../src/routes/asignaturas.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/api/asignaturas", asignaturasRouter);
aplicacion.use(errorHandler);
const entrada = { codigo: "INF100", nombre: "Asignatura", departamentoId: 1, semestreMalla: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  dobles.leer.mockImplementation((_peticion, respuesta) => respuesta.status(200).json({ data: [] }));
  dobles.escribir.mockImplementation((_peticion, respuesta) => respuesta.status(200).json({ data: entrada }));
});

describe("permisos del catálogo de asignaturas sin base de datos", () => {
  it.each(["post", "put", "delete"] as const)("secretaría no puede ejecutar %s ni llegar a la escritura", async (metodo) => {
    dobles.verificar.mockReturnValue({ id: 1, rol: "secretaria" });
    const ruta = metodo === "post" ? "/api/asignaturas" : "/api/asignaturas/INF100";
    const respuesta = await request(aplicacion)[metodo](ruta).auth("prueba", { type: "bearer" }).send(entrada);
    expect(respuesta.status).toBe(403);
    expect(dobles.escribir).not.toHaveBeenCalled();
  });
  it.each(["/api/asignaturas", "/api/asignaturas/INF100"])("secretaría conserva lectura de %s", async (ruta) => {
    dobles.verificar.mockReturnValue({ id: 1, rol: "secretaria" });
    expect((await request(aplicacion).get(ruta).auth("prueba", { type: "bearer" })).status).toBe(200);
    expect(dobles.leer).toHaveBeenCalledOnce();
  });
  it.each(["post", "put", "delete"] as const)("administración conserva %s", async (metodo) => {
    dobles.verificar.mockReturnValue({ id: 2, rol: "admin" });
    const ruta = metodo === "post" ? "/api/asignaturas" : "/api/asignaturas/INF100";
    expect((await request(aplicacion)[metodo](ruta).auth("prueba", { type: "bearer" }).send(entrada)).status).toBe(200);
    expect(dobles.escribir).toHaveBeenCalledOnce();
  });
  it("mantiene el rechazo de profesores y solicitudes sin sesión", async () => {
    expect((await request(aplicacion).get("/api/asignaturas")).status).toBe(401);
    dobles.verificar.mockReturnValue({ id: 3, rol: "profesor" });
    expect((await request(aplicacion).get("/api/asignaturas").auth("prueba", { type: "bearer" })).status).toBe(403);
    expect(dobles.leer).not.toHaveBeenCalled();
  });
});
