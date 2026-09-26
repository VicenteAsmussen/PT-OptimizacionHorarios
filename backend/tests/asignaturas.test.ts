import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";

describe("Módulo Asignaturas (/api/asignaturas)", () => {
  let secretariaCookie: string[];
  const codigoAsignatura = `ASIG${Date.now()}`.slice(0, 15);
  let tipoHoraId: number;
  let carreraId: number;

  beforeAll(async () => {
    // 1. Iniciar sesión como secretaria
    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secRes.headers["set-cookie"];

    // 2. Obtener un tipoHora y carrera válidos de la BD
    const th = await db.query.tiposHora.findFirst();
    tipoHoraId = th!.id;

    const car = await db.query.carreras.findFirst();
    carreraId = car!.id;
  });

  it("Debe crear una asignatura completa con tipos de hora y carreras (201)", async () => {
    const res = await request(app)
      .post("/api/asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        codigo: codigoAsignatura,
        nombre: "Algoritmos y Complejidad",
        semestreMalla: 4,
        esCritica: true,
        tiposHora: [{ tipoHoraId, horas: 4 }],
        carrerasIds: [carreraId],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.codigo).toBe(codigoAsignatura);
    expect(res.body.data.tiposHora).toHaveLength(1);
    expect(res.body.data.carreraAsignaturas).toHaveLength(1);
  });

  it("Debe rechazar la creación si el código ya existe (409 Conflict)", async () => {
    const res = await request(app)
      .post("/api/asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        codigo: codigoAsignatura,
        nombre: "Nombre Duplicado",
        semestreMalla: 2,
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("error");
  });

  it("Debe rechazar la creación si semestreMalla está fuera de rango (400)", async () => {
    const res = await request(app)
      .post("/api/asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        codigo: `FAIL${Date.now()}`.slice(0, 15),
        nombre: "Malla Inválida",
        semestreMalla: 20, // Inválido: max 14
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe rechazar la creación si tipoHoraId no existe (400)", async () => {
    const res = await request(app)
      .post("/api/asignaturas")
      .set("Cookie", secretariaCookie)
      .send({
        codigo: `FAIL${Date.now()}`.slice(0, 15),
        nombre: "TipoHora Inválido",
        semestreMalla: 1,
        tiposHora: [{ tipoHoraId: 99999, horas: 2 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe consultar una asignatura por su código (200)", async () => {
    const res = await request(app)
      .get(`/api/asignaturas/${codigoAsignatura}`)
      .set("Cookie", secretariaCookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.codigo).toBe(codigoAsignatura);
  });

  it("Debe actualizar el nombre y datos de una asignatura (200)", async () => {
    const res = await request(app)
      .put(`/api/asignaturas/${codigoAsignatura}`)
      .set("Cookie", secretariaCookie)
      .send({
        nombre: "Algoritmos y Complejidad Avanzada",
        esCritica: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.nombre).toBe("Algoritmos y Complejidad Avanzada");
    expect(res.body.data.esCritica).toBe(false);
  });

  it("Debe eliminar la asignatura (204) y fallar en consultas posteriores (404)", async () => {
    const delRes = await request(app)
      .delete(`/api/asignaturas/${codigoAsignatura}`)
      .set("Cookie", secretariaCookie);

    expect(delRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/asignaturas/${codigoAsignatura}`)
      .set("Cookie", secretariaCookie);

    expect(getRes.status).toBe(404);
  });
});
