import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const datos = vi.hoisted(() => ({
  perfil: true,
  planificaciones: [] as any[],
  horarios: [] as any[],
  consultar: vi.fn(),
}));
vi.mock("../src/repositories/mi-horario.repository.js", () => ({
  miHorarioRepository: {
    findPlanificaciones: async (profesorId: number) => datos.planificaciones.filter(p => p.profesorId === profesorId),
    findBloques: async () => [{ id: 1, dia: "Lunes", numeroBloque: 1, horaInicio: "08:10", horaTermino: "09:00" }],
  },
}));
vi.mock("../src/repositories/horarios.repository.js", () => ({
  horariosRepository: {
    findProfesorByUsuarioId: async (id: number) => datos.perfil ? { id: id === 1 ? 7 : 8, departamentoId: 99 } : undefined,
    findAll: async (filtro: any) => {
      datos.consultar(filtro);
      return datos.horarios.filter(h => h.profesorId === filtro.profesorId
        && (!filtro.planificacionSemestreId || h.planificacionSemestreId === filtro.planificacionSemestreId));
    },
  },
}));
vi.mock("../src/middlewares/auth.middleware.js", async () => {
  const { UnauthorizedError } = await import("../src/utils/errors.js");
  return { authenticate: (req: any, _res: any, next: any) => {
    if (!req.headers.authorization) return next(new UnauthorizedError("Sin autenticación"));
    req.user = { id: req.headers["x-usuario"] === "2" ? 2 : 1, rol: req.headers.authorization };
    next();
  } };
});
import { horariosRouter } from "../src/routes/horarios.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
const app = express();
app.use(express.json());
app.use("/api/horarios-asignaturas", horariosRouter);
app.use(errorHandler);
const ruta = "/api/horarios-asignaturas/mi-horario";

beforeEach(() => {
  datos.perfil = true;
  datos.consultar.mockClear();
  datos.planificaciones = [
    { id: 10, profesorId: 7, codigo: "2026-2", carreraNombre: "Carrera externa", estadoPlanificacion: "propuesta", actual: true },
    { id: 20, profesorId: 7, codigo: "2025-2", carreraNombre: "Carrera externa", estadoPlanificacion: "publicado", actual: false },
    { id: 30, profesorId: 7, estadoPlanificacion: "preparacion" },
    { id: 40, profesorId: 8, estadoPlanificacion: "publicado" },
  ];
  datos.horarios = [10, 20, 30, 40].map((id, indice) => ({ id: indice + 1, planificacionSemestreId: id, profesorId: id === 40 ? 8 : 7, sala: null }));
});
describe("Consulta del horario propio", () => {
  it("ofrece metadatos de todos los estados con asignaciones, incluso fuera del departamento e históricos", async () => {
    const respuesta = await request(app).get(`${ruta}/contexto`).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.planificaciones.map((p: any) => p.id)).toEqual([10, 20, 30]);
    expect(respuesta.body.data.planificaciones[0].carreraNombre).toBe("Carrera externa");
    expect(respuesta.body.data.bloques[0].dia).toBe("Lunes");
  });
  it("ofrece preparación sin consultar sus clases cuando es el único período asignado", async () => {
    datos.planificaciones = datos.planificaciones.filter(p => p.id === 30);
    const contexto = await request(app).get(`${ruta}/contexto`).set("Authorization", "profesor");
    expect(contexto.status).toBe(200);
    expect(contexto.body.data.planificaciones.map((p: any) => p.id)).toEqual([30]);
    const respuesta = await request(app).get(ruta).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual([]);
    expect(datos.consultar).not.toHaveBeenCalled();
  });
  it("lista metadatos por identidad autenticada aunque no existan clases guardadas", async () => {
    datos.horarios = [];
    for (const usuario of [1, 2]) {
      const respuesta = await request(app).get(`${ruta}/contexto`)
        .set("Authorization", "profesor").set("x-usuario", String(usuario));
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.planificaciones.map((p: any) => p.id)).toEqual(usuario === 1 ? [10, 20, 30] : [40]);
    }
    expect(datos.consultar).not.toHaveBeenCalled();
  });
  it.each([10, 20])("consulta una planificación asignada %s sin depender del departamento", async id => {
    const respuesta = await request(app).get(`${ruta}?planificacionSemestreId=${id}`).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual(datos.horarios.filter(h => h.planificacionSemestreId === id));
    expect(datos.consultar).toHaveBeenCalledWith({ planificacionSemestreId: id, profesorId: 7 });
    expect(respuesta.body.data[0].sala).toBeNull();
  });
  it("mantiene el contrato de arreglo sin filtro y excluye preparación y asignaciones ajenas", async () => {
    const respuesta = await request(app).get(ruta).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.map((h: any) => h.planificacionSemestreId)).toEqual([10, 20]);
  });
  it.each([30, 40, 999])("rechaza selección no visible %s sin consultar sus horarios", async id => {
    const respuesta = await request(app).get(`${ruta}?planificacionSemestreId=${id}`).set("Authorization", "profesor");
    expect(respuesta.status).toBe(403);
    expect(datos.consultar).not.toHaveBeenCalled();
  });
  it("aísla identidades autenticadas", async () => {
    const respuesta = await request(app).get(ruta).set("Authorization", "profesor").set("x-usuario", "2");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.map((h: any) => h.planificacionSemestreId)).toEqual([40]);
    expect((await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "profesor").set("x-usuario", "2")).status).toBe(403);
  });
  it("retorna un arreglo vacío sin clases o planificaciones asignadas", async () => {
    datos.horarios = [];
    expect((await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "profesor")).body.data).toEqual([]);
    datos.planificaciones = [];
    expect((await request(app).get(ruta).set("Authorization", "profesor")).body.data).toEqual([]);
    expect((await request(app).get(`${ruta}/contexto`).set("Authorization", "profesor")).body.data.planificaciones).toEqual([]);
  });
  it("exige autenticación y perfil de profesor", async () => {
    expect((await request(app).get(ruta)).status).toBe(401);
    expect((await request(app).get(`${ruta}/contexto`).set("Authorization", "secretaria")).status).toBe(403);
    datos.perfil = false;
    expect((await request(app).get(ruta).set("Authorization", "admin")).status).toBe(403);
    expect((await request(app).get(`${ruta}/contexto`).set("Authorization", "profesor")).status).toBe(403);
  });
  it("no acepta una identidad ni filtros extra enviados por el cliente", async () => {
    expect((await request(app).get(`${ruta}?profesorId=8`).set("Authorization", "profesor")).status).toBe(400);
    expect((await request(app).get(`${ruta}?planificacionSemestreId=0`).set("Authorization", "profesor")).status).toBe(400);
  });
  it.each(["profesorId=8", "planificacionSemestreId=30", "estado=publicado"])("rechaza filtros no admitidos en contexto: %s", async consulta => {
    const antes = JSON.stringify({ planificaciones: datos.planificaciones, horarios: datos.horarios });
    const respuesta = await request(app).get(`${ruta}/contexto?${consulta}`).set("Authorization", "profesor");
    expect(respuesta.status).toBe(400);
    expect(JSON.stringify({ planificaciones: datos.planificaciones, horarios: datos.horarios })).toBe(antes);
  });
});
