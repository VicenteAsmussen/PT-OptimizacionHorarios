import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";
import { planificacionesSemestres } from "../src/db/schema/planificaciones-semestres.schema.js";

describe("Módulo Disponibilidad Docente (/api/disponibilidad-profesores)", () => {
  let profesorCookie: string[];
  let secretariaCookie: string[];
  let profesorId: number;
  let planificacionSemestreId: number;
  let planificacionActualAnterior: number | undefined;
  let bloqueId1: number;
  let bloqueId2: number;
  beforeAll(async () => {
    const profesor = await request(app).post("/api/auth/login").send({ correo: "cvidal@ubb.cl", clave: "123456" });
    profesorCookie = profesor.headers["set-cookie"];
    const secretaria = await request(app).post("/api/auth/login").send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secretaria.headers["set-cookie"];
    const usuario = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "cvidal@ubb.cl") });
    const perfilProfesor = await db.query.profesores.findFirst({ where: (tabla, { eq }) => eq(tabla.usuarioId, usuario!.id) });
    profesorId = perfilProfesor!.id;
    const perfil = await db.query.secretarias.findFirst();
    const anterior = await db.query.planificacionesSemestres.findFirst({
      where: (tabla, { and, eq }) => and(eq(tabla.carreraId, perfil!.carreraId), eq(tabla.actual, true)),
    });
    planificacionActualAnterior = anterior?.id;
    const planificacion = await db.transaction(async (tx) => {
      await tx.update(planificacionesSemestres).set({ actual: false }).where(eq(planificacionesSemestres.carreraId, perfil!.carreraId));
      const [propia] = await tx.insert(planificacionesSemestres).values({ carreraId: perfil!.carreraId, codigo: "2091-1", actual: true, estadoPlanificacion: "preparacion" }).returning();
      return propia;
    });
    planificacionSemestreId = planificacion.id;
    const bloques = await db.query.bloquesHorarios.findMany({ limit: 2 });
    bloqueId1 = bloques[0].id;
    bloqueId2 = bloques[1].id;
  });
  afterAll(async () => {
    await db.transaction(async (tx) => {
      await tx.delete(planificacionesSemestres).where(eq(planificacionesSemestres.id, planificacionSemestreId));
      if (planificacionActualAnterior !== undefined) await tx.update(planificacionesSemestres).set({ actual: true }).where(eq(planificacionesSemestres.id, planificacionActualAnterior));
    });
  });
  it("sincroniza atómicamente dos bloques (200)", async () => {
    const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Cookie", profesorCookie)
      .send({ profesorId, planificacionSemestreId, bloquesIds: [bloqueId1, bloqueId2] });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toHaveLength(2);
  });
  it("secretaria consulta disponibilidad de su planificación (200)", async () => {
    const respuesta = await request(app).get(`/api/disponibilidad-profesores?profesorId=${profesorId}&planificacionSemestreId=${planificacionSemestreId}`).set("Cookie", secretariaCookie);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toHaveLength(2);
  });
  it("sincronizar arreglo vacío limpia solo esta planificación (200)", async () => {
    const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Cookie", profesorCookie)
      .send({ profesorId, planificacionSemestreId, bloquesIds: [] });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toHaveLength(0);
  });
  it.each([
    { actual: false, estadoPlanificacion: "preparacion" as const },
    { actual: true, estadoPlanificacion: "propuesta" as const },
    { actual: true, estadoPlanificacion: "publicado" as const },
  ])("rechaza sincronizar planificación no editable $actual/$estadoPlanificacion sin mutar", async (estado) => {
    const ruta = `/api/disponibilidad-profesores?profesorId=${profesorId}&planificacionSemestreId=${planificacionSemestreId}`;
    try {
      await db.update(planificacionesSemestres).set(estado).where(eq(planificacionesSemestres.id, planificacionSemestreId));
      const antes = await request(app).get(ruta).set("Cookie", profesorCookie);
      expect(antes.status).toBe(200);
      const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Cookie", profesorCookie)
        .send({ profesorId, planificacionSemestreId, bloquesIds: [bloqueId1] });
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.message).toBe("Solo se puede modificar disponibilidad en una planificación actual en preparación");
      const despues = await request(app).get(ruta).set("Cookie", profesorCookie);
      expect(despues.status).toBe(200);
      expect(despues.body.data).toEqual(antes.body.data);
    } finally {
      await db.update(planificacionesSemestres).set({ actual: true, estadoPlanificacion: "preparacion" }).where(eq(planificacionesSemestres.id, planificacionSemestreId));
    }
  });
  it("rechaza bloques inexistentes (400)", async () => {
    const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Cookie", profesorCookie)
      .send({ profesorId, planificacionSemestreId, bloquesIds: [99999] });
    expect(respuesta.status).toBe(400);
  });
  it("bloquea disponibilidad en propuesta con horarios de esa planificación (403)", async () => {
    // El dueño se obtiene explícitamente de la planificación, nunca del código.
    const planificacion = await db.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, planificacionSemestreId) });
    const asignacion = await db.query.carreraAsignatura.findFirst({ where: (tabla, { and, eq }) => and(eq(tabla.carreraId, planificacion!.carreraId), eq(tabla.asignaturaCodigo, "620431")) });
    const carga = await db.query.asignaturaTipoHora.findFirst({ where: (tabla, { eq }) => eq(tabla.asignaturaCodigo, asignacion!.asignaturaCodigo), with: { tipoHora: true } });
    const tipoHora = carga!.tipoHora;
    const oferta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
      .send({ asignaturaCodigo: asignacion!.asignaturaCodigo, asignaciones: [{ tipoHoraId: tipoHora.id, profesorId }], planificacionSemestreId, seccion: 1, cupos: 20 });
    expect(oferta.status).toBe(201);
    let horarioId: number | undefined;
    try {
      const horario = await request(app).post("/api/horarios-asignaturas").set("Cookie", secretariaCookie)
        .send({ ofertaId: oferta.body.data.id, bloqueId: bloqueId1, tipoHoraId: tipoHora!.id, planificacionSemestreId });
      expect(horario.status).toBe(201);
      horarioId = horario.body.data.id;
      // Crear una fila no genera propuesta: el guard depende del estado explícito.
      await db.update(planificacionesSemestres).set({ estadoPlanificacion: "propuesta" }).where(eq(planificacionesSemestres.id, planificacionSemestreId));
      const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Cookie", profesorCookie)
        .send({ profesorId, planificacionSemestreId, bloquesIds: [bloqueId1] });
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.message).toBe("Solo se puede modificar disponibilidad en una planificación actual en preparación");
    } finally {
      // Solo se restaura nuestra planificación; nunca se reabre una del seed.
      await db.update(planificacionesSemestres).set({ estadoPlanificacion: "preparacion" }).where(eq(planificacionesSemestres.id, planificacionSemestreId));
      if (horarioId) await request(app).delete(`/api/horarios-asignaturas/${horarioId}`).set("Cookie", secretariaCookie);
      await request(app).delete(`/api/ofertas-asignaturas/${oferta.body.data.id}`).set("Cookie", secretariaCookie);
    }
  });
});
