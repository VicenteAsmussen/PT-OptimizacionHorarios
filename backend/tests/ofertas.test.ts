import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";
import { eq } from "drizzle-orm";
import { planificacionesSemestres } from "../src/db/schema/planificaciones-semestres.schema.js";

describe("Módulo Ofertas de Asignaturas (/api/ofertas-asignaturas)", () => {
  let secretariaCookie: string[];
  let adminCookie: string[];
  const asignaturaCodigo = `OF${Date.now()}`.slice(0, 15);
  let profesorId: number;
  let planificacionSemestreId: number;
  let ofertaId1: number;
  let ofertaId2: number;

  beforeAll(async () => {
    const secretaria = await request(app).post("/api/auth/login").send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    expect(secretaria.status).toBe(200);
    secretariaCookie = secretaria.headers["set-cookie"];
    const admin = await request(app).post("/api/auth/login").send({ correo: "admin@ubiobio.cl", clave: "123456" });
    expect(admin.status).toBe(200);
    adminCookie = admin.headers["set-cookie"];
    const profesor = await db.query.profesores.findFirst();
    profesorId = profesor!.id;
    const perfil = await db.query.secretarias.findFirst();
    const [planificacion] = await db.insert(planificacionesSemestres).values({ carreraId: perfil!.carreraId, codigo: "2093-1", anio: 2093 }).returning();
    planificacionSemestreId = planificacion.id;
    const creacion = await request(app).post("/api/asignaturas").set("Cookie", secretariaCookie).send({
      codigo: asignaturaCodigo, nombre: "Base de Datos I", semestreMalla: 4,
      departamentoId: profesor!.departamentoId, carrerasIds: [perfil!.carreraId],
    });
    expect(creacion.status).toBe(201);
  });
  afterAll(async () => {
    await db.delete(planificacionesSemestres).where(eq(planificacionesSemestres.id, planificacionSemestreId));
    await request(app).delete(`/api/asignaturas/${asignaturaCodigo}`).set("Cookie", secretariaCookie);
  });
  it("crea sección 1 (201)", async () => {
    const respuesta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
      .send({ asignaturaCodigo, profesorId, planificacionSemestreId, seccion: 1, cupos: 35 });
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.data).toMatchObject({ asignaturaCodigo, planificacionSemestreId, seccion: 1, cupos: 35 });
    ofertaId1 = respuesta.body.data.id;
  });
  it("rechaza sección duplicada en la misma planificación (409)", async () => {
    const respuesta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
      .send({ asignaturaCodigo, profesorId, planificacionSemestreId, seccion: 1, cupos: 20 });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.message).toContain("Ya existe esta sección");
  });
  it("crea sección 2 de la misma asignatura (201)", async () => {
    const respuesta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
      .send({ asignaturaCodigo, profesorId, planificacionSemestreId, seccion: 2, cupos: 30 });
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.data.seccion).toBe(2);
    ofertaId2 = respuesta.body.data.id;
  });
  it("admin rechaza profesor inexistente (400)", async () => {
    const respuesta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", adminCookie)
      .send({ asignaturaCodigo, profesorId: 99999, planificacionSemestreId, seccion: 3 });
    expect(respuesta.status).toBe(400);
  });
  it("secretaria también valida existencia, sin restringir selección global ni insertar", async () => {
    const ruta = `/api/ofertas-asignaturas?planificacionSemestreId=${planificacionSemestreId}&asignaturaCodigo=${asignaturaCodigo}`;
    const antes = await request(app).get(ruta).set("Cookie", adminCookie);
    const respuesta = await request(app).post("/api/ofertas-asignaturas").set("Cookie", secretariaCookie)
      .send({ asignaturaCodigo, profesorId: 99999, planificacionSemestreId, seccion: 3 });
    expect(respuesta.status).toBe(400);
    const despues = await request(app).get(ruta).set("Cookie", adminCookie);
    expect(despues.body.data).toEqual(antes.body.data);
  });
  it("filtra por planificación y asignatura (200)", async () => {
    const respuesta = await request(app).get(`/api/ofertas-asignaturas?planificacionSemestreId=${planificacionSemestreId}&asignaturaCodigo=${asignaturaCodigo}`).set("Cookie", secretariaCookie);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toHaveLength(2);
  });
  it("actualiza cupos sin alterar sección (200)", async () => {
    const respuesta = await request(app).put(`/api/ofertas-asignaturas/${ofertaId1}`).set("Cookie", secretariaCookie).send({ cupos: 40 });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toMatchObject({ cupos: 40, seccion: 1 });
  });
  it("elimina ofertas vacías (204)", async () => {
    for (const id of [ofertaId1, ofertaId2]) {
      expect((await request(app).delete(`/api/ofertas-asignaturas/${id}`).set("Cookie", secretariaCookie)).status).toBe(204);
    }
  });
});
