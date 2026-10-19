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
  let bloqueId1: number;
  let bloqueId2: number;
  beforeAll(async () => {
    const profesor = await request(app).post("/api/auth/login").send({ correo: "profesor@ubiobio.cl", clave: "123456" });
    profesorCookie = profesor.headers["set-cookie"];
    const secretaria = await request(app).post("/api/auth/login").send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secretaria.headers["set-cookie"];
    const usuario = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "profesor@ubiobio.cl") });
    const perfilProfesor = await db.query.profesores.findFirst({ where: (tabla, { eq }) => eq(tabla.usuarioId, usuario!.id) });
    profesorId = perfilProfesor!.id;
    const perfil = await db.query.secretarias.findFirst();
    const [planificacion] = await db.insert(planificacionesSemestres).values({ carreraId: perfil!.carreraId, codigo: "2091-1" }).returning();
    planificacionSemestreId = planificacion.id;
    const bloques = await db.query.bloquesHorarios.findMany({ limit: 2 });
    bloqueId1 = bloques[0].id;
    bloqueId2 = bloques[1].id;
  });
  afterAll(async () => {
    await db.delete(planificacionesSemestres).where(eq(planificacionesSemestres.id, planificacionSemestreId));
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
  it("rechaza bloques inexistentes (400)", async () => {
    const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Cookie", profesorCookie)
      .send({ profesorId, planificacionSemestreId, bloquesIds: [99999] });
    expect(respuesta.status).toBe(400);
  });
  it("bloquea disponibilidad si existen horarios de esa planificación (403)", async () => {
    // El dueño se obtiene explícitamente de la planificación, nunca del código.
    const planificacion = await db.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, planificacionSemestreId) });
    const asignacion = await db.query.carreraAsignatura.findFirst({ where: (tabla, { eq }) => eq(tabla.carreraId, planificacion!.carreraId) });
    const tipoHora = await db.query.tiposHora.findFirst();
    const oferta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
      .send({ asignaturaCodigo: asignacion!.asignaturaCodigo, profesorId, planificacionSemestreId, seccion: 1, cupos: 20 });
    expect(oferta.status).toBe(201);
    let horarioId: number | undefined;
    try {
      const horario = await request(app).post("/api/horarios-asignaturas").set("Cookie", secretariaCookie)
        .send({ ofertaId: oferta.body.data.id, bloqueId: bloqueId1, tipoHoraId: tipoHora!.id, planificacionSemestreId });
      expect(horario.status).toBe(201);
      horarioId = horario.body.data.id;
      const respuesta = await request(app).post("/api/disponibilidad-profesores/sincronizar").set("Cookie", profesorCookie)
        .send({ profesorId, planificacionSemestreId, bloquesIds: [bloqueId1] });
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.message).toMatch(/propuesta|publicación/);
    } finally {
      if (horarioId) await request(app).delete(`/api/horarios-asignaturas/${horarioId}`).set("Cookie", secretariaCookie);
      await request(app).delete(`/api/ofertas-asignaturas/${oferta.body.data.id}`).set("Cookie", secretariaCookie);
    }
  });
});
