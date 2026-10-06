import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
// Opt in only with an explicitly isolated, disposable database.
const runDatabaseTests = process.env.RUN_ISOLATED_DATABASE_TESTS === "true";
const app = runDatabaseTests ? (await import("../src/app.js")).app : undefined!;
const db = runDatabaseTests ? (await import("../src/config/db.js")).db : undefined!;

describe.skipIf(!runDatabaseTests)("Gestión de Horarios y Detección de Choques (/api/horarios-asignaturas)", () => {
  let secretariaCookie: string[];
  let profesorCookie: string[];
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
    // 1. Iniciar sesión como secretaria y profesor
    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secRes.headers["set-cookie"];

    const profRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "profesor@ubiobio.cl", clave: "123456" });
    profesorCookie = profRes.headers["set-cookie"];

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
    expect(res.body.data.horarioPublicado).toBe(false);
    expect(res.body.data.semestre).not.toHaveProperty("horarioPublicado");
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

  it("Debe leer y actualizar publicación en la entrada existente", async () => {
    for (const horarioPublicado of [true, false]) {
      const updated = await request(app)
        .patch(`/api/horarios-asignaturas/${horarioId}`)
        .set("Cookie", secretariaCookie)
        .send({ horarioPublicado });
      expect(updated.status).toBe(200);
      expect(updated.body.data.horarioPublicado).toBe(horarioPublicado);
      const read = await request(app)
        .get(`/api/horarios-asignaturas/${horarioId}`)
        .set("Cookie", secretariaCookie);
      expect(read.body.data.horarioPublicado).toBe(horarioPublicado);
    }
  });

  it("Debe eliminar la asignación de horario (204)", async () => {
    const res = await request(app)
      .delete(`/api/horarios-asignaturas/${horarioId}`)
      .set("Cookie", secretariaCookie);

    expect(res.status).toBe(204);
  });

  it("Debe permitir crear un horario de propuesta sin sala asignada (salaId ausente o null) (201)", async () => {
    const res = await request(app)
      .post("/api/horarios-asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        ofertaId: ofertaId1,
        bloqueId,
        tipoHoraId,
        semestreId,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.salaId).toBeNull();

    const tempHorarioId = res.body.data.id;

    // Probar filtro por semestreMalla (la asignatura creada tiene semestreMalla=3)
    const filterMallaRes = await request(app)
      .get(`/api/horarios-asignaturas?semestreId=${semestreId}&semestreMalla=3`)
      .set("Cookie", secretariaCookie);

    expect(filterMallaRes.status).toBe(200);
    expect(filterMallaRes.body.data.some((h: { id: number }) => h.id === tempHorarioId)).toBe(true);

    // Probar filtro por profesorId
    const filterProfRes = await request(app)
      .get(`/api/horarios-asignaturas?semestreId=${semestreId}&profesorId=${profesorId}`)
      .set("Cookie", secretariaCookie);

    expect(filterProfRes.status).toBe(200);
    expect(filterProfRes.body.data.some((h: { id: number }) => h.id === tempHorarioId)).toBe(true);

    // Probar endpoint GET /mi-horario como profesor autenticado
    const miHorarioRes = await request(app)
      .get(`/api/horarios-asignaturas/mi-horario?semestreId=${semestreId}`)
      .set("Cookie", profesorCookie);

    expect(miHorarioRes.status).toBe(200);
    expect(miHorarioRes.body.status).toBe("success");
    expect(Array.isArray(miHorarioRes.body.data)).toBe(true);

    // Limpiar el horario de prueba
    await request(app)
      .delete(`/api/horarios-asignaturas/${tempHorarioId}`)
      .set("Cookie", secretariaCookie);
  });
});
