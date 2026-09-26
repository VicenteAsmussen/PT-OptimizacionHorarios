import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Control de Acceso y Roles (RBAC)", () => {
  let adminCookie: string[];
  let secretariaCookie: string[];
  let profesorCookie: string[];

  beforeAll(async () => {
    // 1. Obtener cookies de los 3 roles
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@ubiobio.cl", clave: "123456" });
    adminCookie = adminRes.headers["set-cookie"];

    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secRes.headers["set-cookie"];

    const profRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "profesor@ubiobio.cl", clave: "123456" });
    profesorCookie = profRes.headers["set-cookie"];
  });

  describe("Módulo Salas (/api/salas)", () => {
    it("Secretaria puede consultar salas (200)", async () => {
      const res = await request(app)
        .get("/api/salas")
        .set("Cookie", secretariaCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
    });

    it("Profesor NO puede crear salas (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/salas")
        .set("Cookie", profesorCookie)
        .send({
          nombre: "Sala No Permitida",
          capacidad: 30,
          tipo: "Sala",
        });

      expect(res.status).toBe(403);
    });

    it("Admin puede acceder a salas (200)", async () => {
      const res = await request(app)
        .get("/api/salas")
        .set("Cookie", adminCookie);

      expect(res.status).toBe(200);
    });
  });

  describe("Módulo Horarios (/api/horarios-asignaturas)", () => {
    it("Profesor SÍ puede consultar horarios (200)", async () => {
      const res = await request(app)
        .get("/api/horarios-asignaturas")
        .set("Cookie", profesorCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
    });

    it("Profesor NO puede modificar/crear horarios (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/horarios-asignaturas")
        .set("Cookie", profesorCookie)
        .send({
          ofertaId: 1,
          salaId: 1,
          bloqueId: 1,
          tipoHoraId: 1,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("Módulo Disponibilidad Docente (/api/disponibilidad-profesores)", () => {
    it("Secretaria puede consultar la disponibilidad docente (200)", async () => {
      const res = await request(app)
        .get("/api/disponibilidad-profesores")
        .set("Cookie", secretariaCookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
    });

    it("Secretaria NO puede registrar/modificar disponibilidad de profesores (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/disponibilidad-profesores/sincronizar")
        .set("Cookie", secretariaCookie)
        .send({
          profesorId: 1,
          semestreId: 1,
          bloquesIds: [1, 2],
        });

      expect(res.status).toBe(403);
    });

    it("Profesor puede sincronizar su disponibilidad docente (200 o validación)", async () => {
      const res = await request(app)
        .post("/api/disponibilidad-profesores/sincronizar")
        .set("Cookie", profesorCookie)
        .send({
          profesorId: 1,
          semestreId: 1,
          bloquesIds: [1, 2],
        });

      // Debe ser 200 (si los IDs existen) o 400 si no existen en BD, pero NUNCA 403 Forbidden
      expect(res.status).not.toBe(403);
      expect([200, 400]).toContain(res.status);
    });
  });
});
