import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";

describe("Gestión de Horarios y Detección de Choques (/api/horarios-asignaturas)", () => {
  let secretariaCookie: string[];
  const asignaturaCodigo = `TEST${Date.now()}`.slice(0, 15);
  let profesorId: number;
  let semestreId: number;
  let salaId1: number;
  let salaId2: number;
  let bloqueId: number;
  let tipoHoraId: number;
  let ofertaId1: number;
  let ofertaId2: number;
  let horarioId: number;

  beforeAll(async () => {
    // 1. Iniciar sesión como secretaria
    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secRes.headers["set-cookie"];

    // 2. Obtener IDs reales desde la BD
    const prof = await db.query.profesores.findFirst();
    profesorId = prof!.id;

    const sem = await db.query.semestres.findFirst();
    semestreId = sem!.id;

    const salas = await db.query.salas.findMany({ limit: 2 });
    salaId1 = salas[0].id;
    salaId2 = salas[1].id;

    const bloque = await db.query.bloquesHorarios.findFirst();
    bloqueId = bloque!.id;

    const tipoHora = await db.query.tiposHora.findFirst();
    tipoHoraId = tipoHora!.id;

    // 3. Crear una asignatura para las pruebas
    await request(app)
      .post("/api/asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        codigo: asignaturaCodigo,
        nombre: "Estructuras de Datos Test",
        semestreMalla: 3,
        esCritica: false,
      });

    // 4. Crear 2 ofertas de asignatura (Sección 1 y Sección 2)
    const oferta1Res = await request(app)
      .post("/api/ofertas-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        asignaturaCodigo,
        profesorId,
        semestreId,
        seccion: 1,
        cupos: 30,
      });
    ofertaId1 = oferta1Res.body.data.id;

    const oferta2Res = await request(app)
      .post("/api/ofertas-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        asignaturaCodigo,
        profesorId,
        semestreId,
        seccion: 2,
        cupos: 30,
      });
    ofertaId2 = oferta2Res.body.data.id;
  });

  it("Debe asignar exitosamente un bloque de horario a una oferta (201)", async () => {
    const res = await request(app)
      .post("/api/horarios-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        ofertaId: ofertaId1,
        salaId: salaId1,
        bloqueId,
        tipoHoraId,
        semestreId,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.ofertaId).toBe(ofertaId1);
    horarioId = res.body.data.id;
  });

  it("Debe detectar Choque de Sala: misma sala y bloque en el mismo semestre (409 Conflict)", async () => {
    const res = await request(app)
      .post("/api/horarios-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        ofertaId: ofertaId2,
        salaId: salaId1, // Misma sala 1
        bloqueId, // Mismo bloque
        tipoHoraId,
        semestreId,
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toContain("Conflicto de horario: La sala ya se encuentra ocupada");
  });

  it("Debe detectar Choque de Docente: mismo profesor en dos salas al mismo tiempo (409 Conflict)", async () => {
    // ofertaId2 tiene el mismo profesorId, intentamos ponerlo en salaId2 en el mismo bloque
    const res = await request(app)
      .post("/api/horarios-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        ofertaId: ofertaId2,
        salaId: salaId2, // Otra sala
        bloqueId, // Mismo bloque
        tipoHoraId,
        semestreId,
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toContain("Conflicto de horario: El docente");
  });

  it("Debe eliminar la asignación de horario (204)", async () => {
    const res = await request(app)
      .delete(`/api/horarios-asignaturas/${horarioId}`)
      .set("Cookie", secretariaCookie);

    expect(res.status).toBe(204);
  });
});
