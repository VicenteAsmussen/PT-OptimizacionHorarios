import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const datos = vi.hoisted(() => ({
  profesor: { id: 7, departamentoId: 99 },
  planificaciones: [] as any[], ofertas: [] as any[], bloques: [] as any[], filas: [] as any[],
  bloqueada: false,
  alBloquear: undefined as (() => void) | undefined,
}));
vi.mock("../src/config/db.js", () => {
  const consulta = {
    planificacionesSemestres: {
      findMany: async () => datos.planificaciones,
      findFirst: async () => datos.planificaciones[0],
    },
    ofertasAsignaturas: { findMany: async () => datos.ofertas },
    bloquesHorarios: { findMany: async () => datos.bloques },
    disponibilidadProfesores: {
      findMany: async () => datos.filas.map(fila => ({ ...fila })),
      findFirst: async () => datos.filas[0],
    },
  };
  return { db: {
    query: consulta,
    select: () => ({ from: () => ({ where: () => [] }) }),
    delete: () => ({ where: async () => { expect(datos.bloqueada).toBe(true); datos.filas = []; } }),
    insert: () => ({ values: async (filas: any[]) => { expect(datos.bloqueada).toBe(true); datos.filas = filas.map((fila, indice) => ({ id: indice + 1, ...fila })); } }),
  } };
});
vi.mock("../src/repositories/planificacion-escritura.js", async () => {
  const { db } = await import("../src/config/db.js");
  return { conPlanificacionesEditables: async (_resolver: any, escribir: any) => {
    await _resolver(db);
    datos.alBloquear?.();
    datos.bloqueada = true;
    try { await _resolver(db); return await escribir(db); } finally { datos.bloqueada = false; }
  } };
});
vi.mock("../src/repositories/planificaciones-semestres.repository.js", () => ({
  planificacionesSemestresRepository: { findProfesorByUsuarioId: async () => datos.profesor },
}));
vi.mock("../src/middlewares/auth.middleware.js", async () => {
  const { UnauthorizedError } = await import("../src/utils/errors.js");
  return { authenticate: (req: any, _res: any, next: any) => {
    if (!req.headers.authorization) return next(new UnauthorizedError("Sin autenticación"));
    req.user = { id: 1, rol: req.headers.authorization }; next();
  } };
});
import { disponibilidadRouter } from "../src/routes/disponibilidad.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
const app = express();
app.use(express.json());
app.use("/api/disponibilidad-profesores", disponibilidadRouter);
app.use(errorHandler);
const ruta = "/api/disponibilidad-profesores/mi-disponibilidad";
const carga = [
  { ofertaId: 1, asignaturaCodigo: "A", asignaturaNombre: "Álgebra", seccion: 1, tipoHoraId: 1, tipoHoraNombre: "Cátedra", horas: 2 },
  { ofertaId: 2, asignaturaCodigo: "A", asignaturaNombre: "Álgebra", seccion: 2, tipoHoraId: 1, tipoHoraNombre: "Cátedra", horas: 2 },
  { ofertaId: 2, asignaturaCodigo: "A", asignaturaNombre: "Álgebra", seccion: 2, tipoHoraId: 2, tipoHoraNombre: "Práctica", horas: 1 },
];
beforeEach(() => {
  datos.alBloquear = undefined;
  datos.planificaciones = [{ id: 10, codigo: "2026-2", carreraId: 30, actual: true, estadoPlanificacion: "preparacion", carrera: { nombre: "Otra carrera" } }];
  datos.ofertas = carga.map(fila => ({ id: fila.ofertaId, planificacionSemestreId: 10, seccion: fila.seccion, asignaturaCodigo: fila.asignaturaCodigo,
    asignatura: { nombre: fila.asignaturaNombre, tiposHora: [{ tipoHoraId: fila.tipoHoraId, horas: fila.horas }] },
    asignaciones: [{ profesorId: 7, tipoHoraId: fila.tipoHoraId, tipoHora: { tipo: fila.tipoHoraNombre } }] }));
  datos.bloques = Array.from({ length: 6 }, (_, indice) => ({ id: indice + 1, dia: "Lunes", numeroBloque: indice + 1, horaInicio: "08:00", horaTermino: "09:00" }));
  datos.filas = [{ id: 40, profesorId: 7, planificacionSemestreId: 10, bloqueId: 6 }];
});
describe("Autoservicio de disponibilidad", () => {
  it("excluye otras carreras, periodos y tipos de otro profesor del mínimo", async () => {
    datos.ofertas.push({ ...structuredClone(datos.ofertas[0]), id: 80, planificacionSemestreId: 80 });
    datos.ofertas[0].asignaciones.push({ profesorId: 8, tipoHoraId: 9, tipoHora: { tipo: "Ajena" } });
    datos.ofertas[0].asignatura.tiposHora.push({ tipoHoraId: 9, horas: 99 });
    datos.planificaciones.push({ ...datos.planificaciones[0], id: 80, actual: false }, { ...datos.planificaciones[0], id: 90 });
    const respuesta = await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.planificaciones.map((fila: any) => fila.id)).toEqual([10]);
    expect(respuesta.body.data.seleccion.carga).toEqual(carga);
    expect(respuesta.body.data.seleccion.minimoBloques).toBe(5);
    expect((await request(app).get(`${ruta}?planificacionSemestreId=90`).set("Authorization", "profesor")).status).toBe(403);
  });
  it("revalida asignaciones después de obtener el bloqueo", async () => {
    datos.alBloquear = () => { datos.ofertas = []; };
    const antes = structuredClone(datos.filas);
    const respuesta = await request(app).post(ruta).set("Authorization", "profesor").send({ planificacionSemestreId: 10, bloquesIds: [1, 2, 3, 4, 5] });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.message).toBe("No tiene asignaciones en esta planificación actual");
    expect(datos.filas).toEqual(antes);
  });
  it("las rutas antiguas consultan asignaciones fuera del departamento", async () => {
    const listado = await request(app).get("/api/disponibilidad-profesores?profesorId=7&planificacionSemestreId=10").set("Authorization", "profesor");
    expect(listado.status).toBe(200);
    expect(listado.body.data).toEqual(datos.filas);
    const fila = await request(app).get("/api/disponibilidad-profesores/40").set("Authorization", "profesor");
    expect(fila.status).toBe(200);
    expect(fila.body.data).toEqual(datos.filas[0]);
  });
  it("conserva lectura histórica asignada por rutas antiguas, sin edición ni selector histórico", async () => {
    datos.planificaciones[0].actual = false;
    const listado = await request(app).get("/api/disponibilidad-profesores?planificacionSemestreId=10").set("Authorization", "profesor");
    expect(listado.status).toBe(200);
    expect(listado.body.data).toEqual(datos.filas);
    const fila = await request(app).get("/api/disponibilidad-profesores/40").set("Authorization", "profesor");
    expect(fila.status).toBe(200);
    expect(fila.body.data).toEqual(datos.filas[0]);
    const selector = await request(app).get(ruta).set("Authorization", "profesor");
    expect(selector.body.data.planificaciones).toEqual([]);
    const antes = structuredClone(datos.filas);
    const escritura = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Authorization", "profesor").send({ profesorId: 7, planificacionSemestreId: 10, bloquesIds: [1,2,3,4,5] });
    expect(escritura.status).toBe(403);
    expect(datos.filas).toEqual(antes);
  });
  it("rechaza consultar la disponibilidad de otro profesor", async () => {
    const consulta = await request(app).get("/api/disponibilidad-profesores?profesorId=8").set("Authorization", "profesor");
    expect(consulta.status).toBe(403);
    expect(consulta.body.message).toBe("Solo puede consultar su propia disponibilidad");
    datos.filas[0].profesorId = 8;
    const fila = await request(app).get("/api/disponibilidad-profesores/40").set("Authorization", "profesor");
    expect(fila.status).toBe(403);
    expect(fila.body.message).toBe("Solo puede gestionar su propia disponibilidad");
  });
  it("una planificación sin filas guardadas empieza vacía", async () => {
    datos.filas = [];
    const respuesta = await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.seleccion).toEqual({ planificacionSemestreId: 10, bloquesIds: [], minimoBloques: 5, carga, editable: true });
    expect(datos.filas).toEqual([]);
  });
  it.each([
    { metodo: "post", ruta: "/", cuerpo: { profesorId: 7, planificacionSemestreId: 10, bloqueId: 1 }, codigo: 400 },
    { metodo: "post", ruta: "/sincronizar", cuerpo: { profesorId: 7, planificacionSemestreId: 10, bloquesIds: [] }, codigo: 400 },
    { metodo: "delete", ruta: "/40", cuerpo: {}, codigo: 400 },
    { metodo: "delete", ruta: "/profesor/7/planificacion-semestre/10", cuerpo: {}, codigo: 400 },
    { metodo: "post", ruta: "/sincronizar", cuerpo: { profesorId: 8, planificacionSemestreId: 10, bloquesIds: [1,2,3,4,5] }, codigo: 403 },
  ])("no permite eludir mínimo o identidad por $metodo $ruta", async caso => {
    const antes = structuredClone(datos.filas);
    const peticion = caso.metodo === "post" ? request(app).post(`/api/disponibilidad-profesores${caso.ruta}`) : request(app).delete(`/api/disponibilidad-profesores${caso.ruta}`);
    const respuesta = await peticion.set("Authorization", "profesor").send(caso.cuerpo);
    expect(respuesta.status).toBe(caso.codigo);
    expect(datos.filas).toEqual(antes);
    expect(datos.planificaciones[0].estadoPlanificacion).toBe("preparacion");
  });
  it("conserva sincronización completa del profesor por la ruta antigua", async () => {
    const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Authorization", "profesor")
      .send({ profesorId: 7, planificacionSemestreId: 10, bloquesIds: [1,2,3,4,5] });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.message).toBe("Disponibilidad horaria sincronizada con éxito");
    expect(respuesta.body.data.map((fila: any) => fila.bloqueId)).toEqual([1,2,3,4,5]);
    expect(datos.filas.map(fila => fila.bloqueId)).toEqual([1,2,3,4,5]);
  });
  it("lista únicamente planificaciones actuales asignadas y no expone datos personales", async () => {
    const respuesta = await request(app).get(ruta).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "success", data: {
      planificaciones: [{ id: 10, codigo: "2026-2", carreraNombre: "Otra carrera", estadoPlanificacion: "preparacion", actual: true }],
      bloques: datos.bloques, seleccion: null,
    } });
  });
  it("suma cada sección y tipo asignado sin restringir departamento", async () => {
    const respuesta = await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.seleccion).toEqual({ planificacionSemestreId: 10, bloquesIds: [6], minimoBloques: 5, carga, editable: true });
  });
  it("guarda deduplicado bajo bloqueo sin cambiar estado", async () => {
    const respuesta = await request(app).post(ruta).set("Authorization", "profesor").send({ planificacionSemestreId: 10, bloquesIds: [1, 2, 3, 4, 5, 5] });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "success", data: { planificacionSemestreId: 10, bloquesIds: [1, 2, 3, 4, 5], minimoBloques: 5, carga, editable: true } });
    expect(datos.filas.map(fila => fila.bloqueId)).toEqual([1, 2, 3, 4, 5]);
    expect(datos.planificaciones[0].estadoPlanificacion).toBe("preparacion");
  });
  it.each([[], [1, 1, 1, 1, 1], [1, 2, 3, 4], [1, 2, 3, 4, 999]].map(bloquesIds => ({ bloquesIds })))("rechaza selección inválida $bloquesIds sin reemplazar filas", async ({ bloquesIds }) => {
    const antes = structuredClone(datos.filas);
    const respuesta = await request(app).post(ruta).set("Authorization", "profesor").send({ planificacionSemestreId: 10, bloquesIds });
    expect(respuesta.status).toBe(400);
    const mensaje = bloquesIds.length === 0 ? "Debe seleccionar al menos un bloque de disponibilidad" : bloquesIds.includes(999) ? "Hay bloques horarios inexistentes" : "Debe seleccionar al menos 5 bloques de disponibilidad";
    expect(respuesta.body).toEqual({ status: "error", statusCode: 400, message: mensaje });
    expect(datos.filas).toEqual(antes);
    const lectura = await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "profesor");
    expect(lectura.body.data.seleccion.bloquesIds).toEqual([6]);
    expect(datos.planificaciones[0].estadoPlanificacion).toBe("preparacion");
  });
  it.each(["propuesta", "publicado"])("lee %s sin permitir escritura", async estado => {
    datos.planificaciones[0].estadoPlanificacion = estado;
    const lectura = await request(app).get(`${ruta}?planificacionSemestreId=10`).set("Authorization", "profesor");
    expect(lectura.status).toBe(200);
    expect(lectura.body.data.seleccion.editable).toBe(false);
    const antes = structuredClone(datos.filas);
    const respuesta = await request(app).post(ruta).set("Authorization", "profesor").send({ planificacionSemestreId: 10, bloquesIds: [1, 2, 3, 4, 5] });
    expect(respuesta.status).toBe(403);
    expect(datos.filas).toEqual(antes);
    expect(datos.planificaciones[0].estadoPlanificacion).toBe(estado);
  });
  it.each(["sin asignación", "periodo anterior", "sin carga positiva"])("falla cerrado: %s", async caso => {
    if (caso === "sin asignación") datos.ofertas = [];
    if (caso === "periodo anterior") datos.planificaciones[0].actual = false;
    if (caso === "sin carga positiva") datos.ofertas.forEach(oferta => oferta.asignatura.tiposHora.forEach((tipo: any) => { tipo.horas = 0; }));
    const antes = structuredClone(datos.filas);
    const respuesta = await request(app).post(ruta).set("Authorization", "profesor").send({ planificacionSemestreId: 10, bloquesIds: [1, 2, 3, 4, 5] });
    expect(respuesta.status).toBe(403);
    expect(datos.filas).toEqual(antes);
  });
  it.each([undefined, "admin", "secretaria"])("rechaza identidad %s", async rol => {
    const peticion = request(app).get(ruta);
    if (rol) peticion.set("Authorization", rol);
    expect((await peticion).status).toBe(rol ? 403 : 401);
    const escritura = request(app).post(ruta).send({ planificacionSemestreId: 10, bloquesIds: [1,2,3,4,5] });
    if (rol) escritura.set("Authorization", rol);
    expect((await escritura).status).toBe(rol ? 403 : 401);
    expect(datos.filas.map(fila => fila.bloqueId)).toEqual([6]);
  });
  it("rechaza suplantación y query no positiva", async () => {
    expect((await request(app).post(ruta).set("Authorization", "profesor").send({ profesorId: 8, planificacionSemestreId: 10, bloquesIds: [1, 2, 3, 4, 5] })).status).toBe(400);
    expect((await request(app).get(`${ruta}?planificacionSemestreId=0`).set("Authorization", "profesor")).status).toBe(400);
  });
});
