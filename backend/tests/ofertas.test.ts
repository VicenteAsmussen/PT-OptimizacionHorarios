import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";

describe("Módulo Ofertas de Asignaturas (/api/ofertas-asignaturas)", () => {
  let secretariaCookie: string[];
  const asignaturaCodigo = `OF${Date.now()}`.slice(0, 15);
  let profesorId: number;
  let semestreId: number;
  let ofertaId1: number;
  let ofertaId2: number;

  beforeAll(async () => {
    // 1. Iniciar sesión como secretaria
    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secRes.headers["set-cookie"];

    // 2. Obtener un profesor y semestre reales
    const prof = await db.query.profesores.findFirst();
    profesorId = prof!.id;

    const sem = await db.query.semestres.findFirst();
    semestreId = sem!.id;

    // 3. Crear asignatura de apoyo
    await request(app)
      .post("/api/asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        codigo: asignaturaCodigo,
        nombre: "Base de Datos I",
        semestreMalla: 4,
      });
  });

  afterAll(async () => {
    // Limpieza de la asignatura creada
    await request(app)
      .delete(`/api/asignaturas/${asignaturaCodigo}`)
      .set("Cookie", secretariaCookie);
  });

  it("Debe crear una oferta de asignatura para la sección 1 (201)", async () => {
    const res = await request(app)
      .post("/api/ofertas-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        asignaturaCodigo,
        profesorId,
        semestreId,
        seccion: 1,
        cupos: 35,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.asignaturaCodigo).toBe(asignaturaCodigo);
    expect(res.body.data.seccion).toBe(1);
    expect(res.body.data.cupos).toBe(35);
    ofertaId1 = res.body.data.id;
  });

  it("Debe rechazar la creación de una sección duplicada en el mismo semestre (409 Conflict)", async () => {
    const res = await request(app)
      .post("/api/ofertas-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        asignaturaCodigo,
        profesorId,
        semestreId,
        seccion: 1, // Ya existe la sección 1
        cupos: 20,
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toContain("Ya existe una oferta");
  });

  it("Debe permitir crear la sección 2 de la misma asignatura (201)", async () => {
    const res = await request(app)
      .post("/api/ofertas-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        asignaturaCodigo,
        profesorId,
        semestreId,
        seccion: 2,
        cupos: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.seccion).toBe(2);
    ofertaId2 = res.body.data.id;
  });

  it("Debe fallar al crear oferta con profesor inexistente (400)", async () => {
    const res = await request(app)
      .post("/api/ofertas-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        asignaturaCodigo,
        profesorId: 99999,
        semestreId,
        seccion: 3,
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe filtrar ofertas por semestreId y asignaturaCodigo (200)", async () => {
    const res = await request(app)
      .get(`/api/ofertas-asignaturas?semestreId=${semestreId}&asignaturaCodigo=${asignaturaCodigo}`)
      .set("Cookie", secretariaCookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveLength(2);
  });

  it("Debe actualizar los cupos de una oferta (200)", async () => {
    const res = await request(app)
      .put(`/api/ofertas-asignaturas/${ofertaId1}`)
      .set("Cookie", secretariaCookie)
      .send({
        cupos: 40,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.cupos).toBe(40);
  });

  it("Debe eliminar las ofertas creadas (204)", async () => {
    const del1 = await request(app)
      .delete(`/api/ofertas-asignaturas/${ofertaId1}`)
      .set("Cookie", secretariaCookie);
    expect(del1.status).toBe(204);

    const del2 = await request(app)
      .delete(`/api/ofertas-asignaturas/${ofertaId2}`)
      .set("Cookie", secretariaCookie);
    expect(del2.status).toBe(204);
  });
});
