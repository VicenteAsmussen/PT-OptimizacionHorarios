import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { planificacionesSemestres } from "../src/db/schema/planificaciones-semestres.schema.js";
// Opt in only with an explicitly isolated, disposable database.
const runDatabaseTests = process.env.RUN_ISOLATED_DATABASE_TESTS === "true";
const app = runDatabaseTests ? (await import("../src/app.js")).app : undefined!;
const db = runDatabaseTests ? (await import("../src/config/db.js")).db : undefined!;

describe.skipIf(!runDatabaseTests)("Gestión de Horarios y Choques (/api/horarios-asignaturas)", () => {
  let secretariaCookie: string[];
  let profesorCookie: string[];
  const asignaturaCodigo = `TEST${Date.now()}`.slice(0, 15);
  let profesorId: number;
  let planificacionSemestreId: number;
  let salaId1: number;
  let salaId2: number;
  let bloqueId: number;
  let tipoHoraId: number;
  let ofertaId1: number;
  let ofertaId2: number;
  let horarioId: number;
  beforeAll(async () => {
    const secretaria = await request(app).post("/api/auth/login").send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secretaria.headers["set-cookie"];
    const profesor = await request(app).post("/api/auth/login").send({ correo: "cvidal@ubb.cl", clave: "123456" });
    profesorCookie = profesor.headers["set-cookie"];
    const perfil = await db.query.profesores.findFirst();
    profesorId = perfil!.id;
    const secretariaPerfil = await db.query.secretarias.findFirst();
    const [planificacion] = await db.insert(planificacionesSemestres).values({ carreraId: secretariaPerfil!.carreraId, codigo: "2092-1" }).returning();
    planificacionSemestreId = planificacion.id;
    const salas = await db.query.salas.findMany({ limit: 2 });
    salaId1 = salas[0].id;
    salaId2 = salas[1].id;
    bloqueId = (await db.query.bloquesHorarios.findFirst())!.id;
    tipoHoraId = (await db.query.tiposHora.findFirst())!.id;
    const asignatura = await request(app).post("/api/asignaturas").set("Cookie", secretariaCookie).send({
      codigo: asignaturaCodigo, nombre: "Estructuras de Datos Test", semestreMalla: 3,
      departamentoId: perfil!.departamentoId, carrerasIds: [secretariaPerfil!.carreraId], esCritica: false,
    });
    expect(asignatura.status).toBe(201);
    const ofertas: number[] = [];
    for (const seccion of [1, 2]) {
      const respuesta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
        .send({ asignaturaCodigo, profesorId, planificacionSemestreId, seccion, cupos: 30 });
      expect(respuesta.status).toBe(201);
      ofertas.push(respuesta.body.data.id);
    }
    [ofertaId1, ofertaId2] = ofertas;
  });
  afterAll(async () => {
    await db.delete(planificacionesSemestres).where(eq(planificacionesSemestres.id, planificacionSemestreId));
    await request(app).delete(`/api/asignaturas/${asignaturaCodigo}`).set("Cookie", secretariaCookie);
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
    const propio = await request(app).get(`/api/horarios-asignaturas/mi-horario?planificacionSemestreId=${planificacionSemestreId}`).set("Cookie", profesorCookie);
    expect(propio.status).toBe(200);
    expect(Array.isArray(propio.body.data)).toBe(true);
    await request(app).delete(`/api/horarios-asignaturas/${id}`).set("Cookie", secretariaCookie);
  });
});
