import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { planificacionesSemestres } from "../src/db/schema/planificaciones-semestres.schema.js";
import { habilitarPruebasIntegracion } from "./soporte/base-pruebas.js";

const ejecutarIntegracion = habilitarPruebasIntegracion(process.env);
const app = ejecutarIntegracion ? (await import("../src/app.js")).app : undefined!;
const db = ejecutarIntegracion ? (await import("../src/config/db.js")).db : undefined!;

describe.skipIf(!ejecutarIntegracion)("Gestión de Horarios y Choques (/api/horarios-asignaturas)", () => {
  let secretariaCookie: string[];
  let profesorCookie: string[];
  const asignaturaCodigo = `TEST${Date.now()}`.slice(0, 15);
  let profesorId: number;
  let planificacionSemestreId: number;
  let planificacionActualAnterior: number | undefined;
  let asignaturaCreada = false;
  let salaId1: number;
  let salaId2: number;
  let bloqueId: number;
  let tipoHoraId: number;
  let ofertaId1: number;
  let ofertaId2: number;
  let horarioId: number;
  beforeAll(async () => {
    const secretaria = await request(app).post("/api/auth/login").send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    expect(secretaria.status).toBe(200);
    secretariaCookie = secretaria.headers["set-cookie"];
    const profesor = await request(app).post("/api/auth/login").send({ correo: "cvidal@ubb.cl", clave: "123456" });
    expect(profesor.status).toBe(200);
    profesorCookie = profesor.headers["set-cookie"];
    const perfil = await db.query.profesores.findFirst({
      where: (tabla, { eq }) => eq(tabla.usuarioId, profesor.body.data.user.id),
    });
    profesorId = perfil!.id;
    const secretariaPerfil = await db.query.secretarias.findFirst();
    const [planificacion] = await db.transaction(async tx => {
      const anterior = await tx.query.planificacionesSemestres.findFirst({
        where: (tabla, { and, eq }) => and(eq(tabla.carreraId, secretariaPerfil!.carreraId), eq(tabla.actual, true)),
      });
      planificacionActualAnterior = anterior?.id;
      await tx.update(planificacionesSemestres).set({ actual: false }).where(eq(planificacionesSemestres.carreraId, secretariaPerfil!.carreraId));
      return tx.insert(planificacionesSemestres).values({
        carreraId: secretariaPerfil!.carreraId, codigo: "2092-1", actual: true, estadoPlanificacion: "preparacion",
      }).returning();
    });
    planificacionSemestreId = planificacion.id;
    const salas = await db.query.salas.findMany({ where: (tabla, { eq }) => eq(tabla.tipo, "Sala"), limit: 2 });
    salaId1 = salas[0].id;
    salaId2 = salas[1].id;
    bloqueId = (await db.query.bloquesHorarios.findFirst())!.id;
    tipoHoraId = (await db.query.tiposHora.findFirst({ where: (tabla, { eq }) => eq(tabla.tipo, "Teórica") }))!.id;
    const asignatura = await request(app).post("/api/asignaturas").set("Cookie", secretariaCookie).send({
      codigo: asignaturaCodigo, nombre: "Estructuras de Datos Test", semestreMalla: 3,
       departamentoId: perfil!.departamentoId, carrerasIds: [secretariaPerfil!.carreraId], esCritica: false,
       tiposHora: [{ tipoHoraId, horas: 4 }],
    });
    expect(asignatura.status).toBe(201);
    asignaturaCreada = true;
    const ofertas: number[] = [];
    for (const seccion of [1, 2]) {
      const respuesta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
        .send({ asignaturaCodigo, asignaciones: [{ tipoHoraId, profesorId }], planificacionSemestreId, seccion, cupos: 30 });
      expect(respuesta.status).toBe(201);
      ofertas.push(respuesta.body.data.id);
    }
    [ofertaId1, ofertaId2] = ofertas;
  });
  afterAll(async () => {
    await db.transaction(async tx => {
      if (planificacionSemestreId !== undefined) await tx.delete(planificacionesSemestres).where(eq(planificacionesSemestres.id, planificacionSemestreId));
      if (planificacionActualAnterior !== undefined) await tx.update(planificacionesSemestres).set({ actual: true }).where(eq(planificacionesSemestres.id, planificacionActualAnterior));
    });
    if (asignaturaCreada) await request(app).delete(`/api/asignaturas/${asignaturaCodigo}`).set("Cookie", secretariaCookie).expect(204);
  });
  it("asigna un bloque a una oferta (201), con estado anidado y sin publicación por entrada", async () => {
    const respuesta = await request(app).post("/api/horarios-asignaturas").set("Cookie", secretariaCookie)
      .send({ ofertaId: ofertaId1, salaId: salaId1, bloqueId, tipoHoraId, planificacionSemestreId });
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.data.ofertaId).toBe(ofertaId1);
    expect(respuesta.body.data).not.toHaveProperty("horarioPublicado");
    expect(respuesta.body.data.planificacionSemestre).toHaveProperty("estadoPlanificacion");
    horarioId = respuesta.body.data.id;
  });
  it("detecta choque de sala dentro de la planificación (409)", async () => {
    const respuesta = await request(app).post("/api/horarios-asignaturas").set("Cookie", secretariaCookie)
      .send({ ofertaId: ofertaId2, salaId: salaId1, bloqueId, tipoHoraId, planificacionSemestreId });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.message).toMatch(/sala ocupada/);
  });
  it("detecta choque de profesor dentro de la planificación (409)", async () => {
    const respuesta = await request(app).post("/api/horarios-asignaturas").set("Cookie", secretariaCookie)
      .send({ ofertaId: ofertaId2, salaId: salaId2, bloqueId, tipoHoraId, planificacionSemestreId });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.message).toMatch(/profesor ocupado/);
  });
  it("rechaza publicación por entrada y conserva la respuesta de lectura", async () => {
    for (const horarioPublicado of [true, false]) {
      const respuesta = await request(app).put(`/api/horarios-asignaturas/${horarioId}`).set("Cookie", secretariaCookie).send({ horarioPublicado });
      expect(respuesta.status).toBe(400);
      const lectura = await request(app).get(`/api/horarios-asignaturas/${horarioId}`).set("Cookie", secretariaCookie);
      expect(lectura.status).toBe(200);
      expect(lectura.body.data).not.toHaveProperty("horarioPublicado");
    }
  });
  it("elimina asignación (204)", async () => {
    expect((await request(app).delete(`/api/horarios-asignaturas/${horarioId}`).set("Cookie", secretariaCookie)).status).toBe(204);
  });
  it("permite entrada sin sala y mantiene filtros de malla/profesor y mi-horario", async () => {
    const respuesta = await request(app).post("/api/horarios-asignaturas").set("Cookie", secretariaCookie)
      .send({ ofertaId: ofertaId1, bloqueId, tipoHoraId, planificacionSemestreId });
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.data.salaId).toBeNull();
    const id = respuesta.body.data.id;
    for (const filtro of ["semestreMalla=3", `profesorId=${profesorId}`]) {
      const lectura = await request(app).get(`/api/horarios-asignaturas?planificacionSemestreId=${planificacionSemestreId}&${filtro}`).set("Cookie", secretariaCookie);
      expect(lectura.status).toBe(200);
      expect(lectura.body.data.some((fila: { id: number }) => fila.id === id)).toBe(true);
    }
    const rutaPropia = `/api/horarios-asignaturas/mi-horario?planificacionSemestreId=${planificacionSemestreId}`;
    expect((await request(app).get(rutaPropia).set("Cookie", profesorCookie)).status).toBe(403);
    try {
      await db.update(planificacionesSemestres).set({ estadoPlanificacion: "propuesta" }).where(eq(planificacionesSemestres.id, planificacionSemestreId));
      const propio = await request(app).get(rutaPropia).set("Cookie", profesorCookie);
      expect(propio.status).toBe(200);
      expect(propio.body.data.some((fila: { id: number }) => fila.id === id)).toBe(true);
    } finally {
      await db.update(planificacionesSemestres).set({ estadoPlanificacion: "preparacion" }).where(eq(planificacionesSemestres.id, planificacionSemestreId));
    }
    await request(app).delete(`/api/horarios-asignaturas/${id}`).set("Cookie", secretariaCookie).expect(204);
  });
});
