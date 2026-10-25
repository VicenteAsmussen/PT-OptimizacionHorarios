import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const datos = vi.hoisted(() => ({ profesores: [] as any[], carreraId: 3, perfil: true, actual: true }));
vi.mock("../src/config/db.js", () => ({ db: {
  query: { profesores: { findMany: async () => datos.profesores } },
  select: () => ({ from: () => ({ where: () => [] }) }),
} }));
vi.mock("../src/utils/alcance-carrera.js", async importar => {
  const original = await importar<typeof import("../src/utils/alcance-carrera.js")>();
  return { ...original, resolverAlcanceCarrera: async () => {
    if (!datos.perfil) throw new originalError("Sin perfil de secretaria");
    return { carreraId: 3, departamentosGestionadosIds: [5], departamentosIds: [5, 6], profesoresIds: [7, 8, 9], asignaturasCodigos: [], ofertasIds: [] };
  } };
});
vi.mock("../src/repositories/planificaciones-semestres.repository.js", () => ({
  planificacionesSemestresRepository: { findById: async (id: number) => ({ id, carreraId: datos.carreraId, actual: datos.actual }) },
}));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: any, _res: any, next: any) => {
  if (!req.headers.authorization) return next(new UnauthorizedError("Sin autenticación"));
  req.user = { id: 1, rol: req.headers.authorization }; next();
} }));
import { ForbiddenError as originalError, UnauthorizedError } from "../src/utils/errors.js";
import { disponibilidadRouter } from "../src/routes/disponibilidad.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
const app = express();
app.use(express.json());
app.use("/api/disponibilidad-profesores", disponibilidadRouter);
app.use(errorHandler);
const ruta = "/api/disponibilidad-profesores/seguimiento";
const consultar = () => request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "secretaria");
const asignacion = (ofertaId: number, horas: number, planificacionSemestreId = 10, tipoHoraId = 1) => ({
  ofertaId, tipoHoraId, oferta: { planificacionSemestreId, asignatura: { tiposHora: [{ tipoHoraId, horas }] } },
});
beforeEach(() => {
  datos.perfil = true; datos.carreraId = 3; datos.actual = true;
  datos.profesores = [{ id: 7, nombre: "Profesora A", departamentoId: 5, departamento: { id: 5, nombre: "Departamento gestionado" },
    asignaciones: [asignacion(1, 3), asignacion(2, 3), asignacion(2, 2, 10, 2), asignacion(3, 90, 11)],
    disponibilidades: [] }];
});
describe("Seguimiento de disponibilidad de secretaria", () => {
  it("muestra solo profesores asignados de departamentos gestionados y calcula el mínimo por planificación", async () => {
    datos.profesores.push({ ...datos.profesores[0], id: 8, departamentoId: 6 },
      { ...datos.profesores[0], id: 9, asignaciones: [asignacion(4, 9, 11)] });
    const respuesta = await consultar();
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual([{ profesorId: 7, nombre: "Profesora A", departamento: { id: 5, nombre: "Departamento gestionado" },
      minimoBloques: 8, bloquesEnviados: 0, enviada: false }]);
  });
  it("considera enviada la disponibilidad persistida del profesor y período, sin estado de insuficiencia", async () => {
    datos.profesores[0].disponibilidades = Array.from({ length: 10 }, (_, indice) => ({ profesorId: 7, planificacionSemestreId: 10, bloqueId: indice + 1 }));
    datos.profesores[0].disponibilidades.push({ profesorId: 7, planificacionSemestreId: 11, bloqueId: 99 },
      { profesorId: 8, planificacionSemestreId: 10, bloqueId: 99 });
    const respuesta = await consultar();
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data[0]).toMatchObject({ bloquesEnviados: 10, minimoBloques: 8, enviada: true });
    expect(respuesta.body.data[0]).not.toHaveProperty("insuficiente");
  });
  it("no confunde disponibilidad de otros profesores o períodos con un envío", async () => {
    datos.profesores[0].disponibilidades = [{ profesorId: 7, planificacionSemestreId: 11, bloqueId: 1 },
      { profesorId: 8, planificacionSemestreId: 10, bloqueId: 2 }];
    const respuesta = await consultar();
    expect(respuesta.body.data[0]).toMatchObject({ bloquesEnviados: 0, enviada: false });
  });
  it("devuelve una lista vacía sin asignaciones", async () => {
    datos.profesores = [];
    const respuesta = await consultar();
    expect(respuesta.status).toBe(200); expect(respuesta.body.data).toEqual([]);
  });
  it("rechaza otras carreras y secretarias sin perfil", async () => {
    datos.carreraId = 9; expect((await consultar()).status).toBe(404);
    datos.carreraId = 3; datos.perfil = false; expect((await consultar()).status).toBe(403);
  });
  it("rechaza planificaciones históricas sin alterar datos", async () => {
    datos.actual = false;
    const antes = structuredClone(datos.profesores);
    const respuesta = await consultar();
    expect(respuesta.status).toBe(403);
    expect(datos.profesores).toEqual(antes);
  });
  it("requiere autenticación y rol secretaria", async () => {
    expect((await request(app).get(`${ruta}?planificacionSemestreId=10`)).status).toBe(401);
    for (const rol of ["profesor", "admin", "jefe_carrera"]) {
      expect((await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", rol)).status).toBe(403);
    }
  });
  it("requiere una planificación válida y no acepta alcance enviado por el cliente", async () => {
    for (const consulta of ["", "?planificacionSemestreId=0", "?planificacionSemestreId=abc", "?planificacionSemestreId=10&carreraId=9"]) {
      expect((await request(app).get(ruta + consulta).set("Authorization", "secretaria")).status).toBe(400);
    }
  });
});
