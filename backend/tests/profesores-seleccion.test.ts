import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { consultas, respuestas } = vi.hoisted(() => ({
  consultas: [] as { sql: string; parametros: unknown[] }[],
  respuestas: [] as unknown[][][],
}));
// SQL real contra un proxy en memoria: sin conexión, credenciales ni escrituras.
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const esquema = await import("../src/db/schema/index.js");
  return { db: drizzle(async (sql, parametros) => {
    consultas.push({ sql, parametros });
    return { rows: respuestas.shift() ?? [] };
  }, { schema: esquema }) };
});
vi.mock("../src/utils/jwt.js", () => ({ verifyToken: (rol: string) => {
  if (!["admin", "secretaria", "profesor"].includes(rol)) throw new Error("Token inválido");
  return { id: 42, rol };
} }));
vi.mock("../src/repositories/carreras.repository.js", () => ({ carrerasRepository: {
  findAlcanceByUsuarioId: vi.fn(),
} }));
import { profesoresRouter } from "../src/routes/profesores.routes.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { carrerasRepository } from "../src/repositories/carreras.repository.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/profesores", profesoresRouter);
aplicacion.use(errorHandler);
const alcance = {
  carreraId: 1, asignaturasCodigos: ["LOCAL"], departamentosIds: [4],
  departamentosGestionadosIds: [4], profesoresIds: [7], ofertasIds: [9],
};
const seleccion = [
  { id: 7, nombre: "Ana", rut: "12345678-5", departamento: { id: 4, nombre: "Local" } },
  { id: 99, nombre: "Berta", rut: "11111111-1", departamento: { id: 60, nombre: "Ajeno" } },
];
function filasSeleccion() {
  return seleccion.map(({ id, nombre, rut, departamento }) => [id, nombre, rut, departamento.id, departamento.nombre]);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  consultas.length = 0;
  respuestas.length = 0;
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(alcance);
});

describe("GET /profesores/seleccion", () => {
  it.each(["admin", "secretaria"])("%s recibe solo la proyección mínima de todos los departamentos", async (rol) => {
    respuestas.push(filasSeleccion());
    const respuesta = await request(aplicacion).get("/profesores/seleccion").auth(rol, { type: "bearer" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "success", data: seleccion });
    expect(consultas).toHaveLength(1);
    // Sin filtro de departamento/carrera y sin relaciones de cuenta, ofertas o disponibilidad.
    expect(consultas[0].sql).not.toMatch(/\bwhere\b|usuario|correo|clave|ofertas|disponibilidad/i);
    expect(consultas[0].parametros).toEqual([]);
    if (rol === "secretaria") {
      expect(carrerasRepository.findAlcanceByUsuarioId).toHaveBeenCalledWith(42);
    } else {
      expect(carrerasRepository.findAlcanceByUsuarioId).not.toHaveBeenCalled();
    }
  });

  it("no acepta filtros del cliente que reduzcan la selección global", async () => {
    respuestas.push(filasSeleccion());
    const respuesta = await request(aplicacion)
      .get("/profesores/seleccion?departamentoId=4&carreraId=999")
      .auth("secretaria", { type: "bearer" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual(seleccion);
    expect(consultas[0].parametros).toEqual([]);
  });

  it("devuelve selección vacía sin ampliar la respuesta", async () => {
    const respuesta = await request(aplicacion).get("/profesores/seleccion").auth("admin", { type: "bearer" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "success", data: [] });
  });

  it("secretaria sin carrera válida falla antes de consultar profesores", async () => {
    vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(undefined);
    const respuesta = await request(aplicacion).get("/profesores/seleccion").auth("secretaria", { type: "bearer" });
    expect(respuesta.status).toBe(403);
    expect(consultas).toEqual([]);
  });

  it.each([[undefined, 401], ["invalido", 401], ["profesor", 403]] as const)(
    "rechaza credencial %s con %s sin consultar datos", async (token, estado) => {
      const peticion = request(aplicacion).get("/profesores/seleccion");
      if (token) peticion.auth(token, { type: "bearer" });
      expect((await peticion).status).toBe(estado);
      expect(consultas).toEqual([]);
      expect(carrerasRepository.findAlcanceByUsuarioId).not.toHaveBeenCalled();
    },
  );
});

describe("La selección no amplía la gestión de profesores", () => {
  it("conserva listado de gestión acotado y rechaza filtro de departamento ajeno", async () => {
    const listar = vi.spyOn(profesoresRepository, "findAll").mockResolvedValue([]);
    const respuesta = await request(aplicacion).get("/profesores").auth("secretaria", { type: "bearer" });
    expect(respuesta.status).toBe(200);
    expect(listar).toHaveBeenCalledWith(undefined, alcance);
    expect((await request(aplicacion).get("/profesores?departamentoId=60")
      .auth("secretaria", { type: "bearer" })).status).toBe(403);
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it.each(["get", "put", "delete"] as const)("%s no permite gestionar al profesor externo seleccionado", async (metodo) => {
    vi.spyOn(profesoresRepository, "findById").mockResolvedValue({
      id: 99, nombre: "Berta", departamentoId: 60, tipo: "part time", usuarioId: null,
    } as never);
    const actualizar = vi.spyOn(profesoresRepository, "updateWithSyncedUsuarioName");
    const eliminar = vi.spyOn(profesoresRepository, "deleteWithDependencias");
    const peticion = request(aplicacion)[metodo]("/profesores/99").auth("secretaria", { type: "bearer" });
    if (metodo === "put") peticion.send({ nombre: "Cambio" });
    expect((await peticion).status).toBe(404);
    expect(actualizar).not.toHaveBeenCalled();
    expect(eliminar).not.toHaveBeenCalled();
  });
});
