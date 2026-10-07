import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";

describe("Módulo Disponibilidad Docente (/api/disponibilidad-profesores)", () => {
  let profesorCookie: string[];
  let secretariaCookie: string[];
  let profesorId: number;
  let semestreId: number;
  let bloqueId1: number;
  let bloqueId2: number;

  beforeAll(async () => {
    // 1. Iniciar sesión como profesor y secretaria
    const profRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "profesor@ubiobio.cl", clave: "123456" });
    profesorCookie = profRes.headers["set-cookie"];

    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secRes.headers["set-cookie"];

    // 2. Obtener IDs reales
    const prof = await db.query.profesores.findFirst();
    profesorId = prof!.id;

    const sem = await db.query.semestres.findFirst();
    semestreId = sem!.id;

    const bloques = await db.query.bloquesHorarios.findMany({ limit: 2 });
    bloqueId1 = bloques[0].id;
    bloqueId2 = bloques[1].id;
  });

  it("Debe sincronizar atómicamente la grilla de disponibilidad con 2 bloques (200)", async () => {
    const res = await request(app)
      .post("/api/disponibilidad-profesores/sincronizar")
      .set("Cookie", profesorCookie)
      .send({
        profesorId,
        semestreId,
        bloquesIds: [bloqueId1, bloqueId2],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveLength(2);
  });

  it("Secretaria puede consultar la disponibilidad del profesor (200)", async () => {
    const res = await request(app)
      .get(`/api/disponibilidad-profesores?profesorId=${profesorId}&semestreId=${semestreId}`)
      .set("Cookie", secretariaCookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveLength(2);
  });

  it("Debe limpiar la grilla al sincronizar con un arreglo vacío [] (200)", async () => {
    const res = await request(app)
      .post("/api/disponibilidad-profesores/sincronizar")
      .set("Cookie", profesorCookie)
      .send({
        profesorId,
        semestreId,
        bloquesIds: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveLength(0);
  });

  it("Debe rechazar la sincronización si se envían bloques inexistentes (400)", async () => {
    const res = await request(app)
      .post("/api/disponibilidad-profesores/sincronizar")
      .set("Cookie", profesorCookie)
      .send({
        profesorId,
        semestreId,
        bloquesIds: [99999],
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe bloquear la edición de disponibilidad si ya existen propuestas/horarios creados para el semestre (403 Forbidden)", async () => {
    // 1. Obtener datos base y crear oferta temporal
    const asignatura = await db.query.asignaturas.findFirst();
    const tipoHora = await db.query.tiposHora.findFirst();

    const seccionTemporal = 9000 + Math.floor(Math.random() * 1000);
    const ofertaRes = await request(app)
      .post("/api/ofertas-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        asignaturaCodigo: asignatura!.codigo,
        profesorId,
        semestreId,
        seccion: seccionTemporal,
        cupos: 20,
      });
    expect(ofertaRes.status).toBe(201);
    const ofertaId = ofertaRes.body.data.id;
    let tempHorarioId: number | undefined;

    try {
      // Crear horario de propuesta para el semestre
      const horarioRes = await request(app)
        .post("/api/horarios-asignaturas")
        .set("Cookie", secretariaCookie)
        .send({
          ofertaId,
          bloqueId: bloqueId1,
          tipoHoraId: tipoHora!.id,
          semestreId,
        });
      expect(horarioRes.status).toBe(201);
      tempHorarioId = horarioRes.body.data.id;

      // 2. Intentar sincronizar disponibilidad para ese semestre -> Debe ser rechazado con 403
      const syncRes = await request(app)
        .post("/api/disponibilidad-profesores/sincronizar")
        .set("Cookie", profesorCookie)
        .send({
          profesorId,
          semestreId,
          bloquesIds: [bloqueId1],
        });

      expect(syncRes.status).toBe(403);
      expect(syncRes.body.status).toBe("error");
      expect(syncRes.body.message).toContain("ya existe una propuesta de horarios");
    } finally {
      // 3. Limpiar horario y oferta de prueba
      if (tempHorarioId) {
        await request(app)
          .delete(`/api/horarios-asignaturas/${tempHorarioId}`)
          .set("Cookie", secretariaCookie);
      }

      await request(app)
        .delete(`/api/ofertas-asignaturas/${ofertaId}`)
        .set("Cookie", secretariaCookie);
    }
  });
});
