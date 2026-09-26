import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";

describe("Módulo Usuarios y Seguridad (/api/usuarios)", () => {
  let adminCookie: string[];
  const correoSecretariaTest = `sec_${Date.now()}@ubiobio.cl`;
  let carreraId: number;
  let usuarioId: number;

  beforeAll(async () => {
    // 1. Iniciar sesión como admin
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@ubiobio.cl", clave: "123456" });
    adminCookie = adminRes.headers["set-cookie"];

    // 2. Obtener carrera existente
    const carrera = await db.query.carreras.findFirst();
    carreraId = carrera!.id;
  });

  it("Debe crear un usuario con rol secretaria y asociarle una carrera (201)", async () => {
    const res = await request(app)
      .post("/api/usuarios")
      .set("Cookie", adminCookie)
      .send({
        nombre: "Secretaria Nueva Test",
        correo: correoSecretariaTest,
        clave: "passwordSegura123",
        rol: "secretaria",
        carreraId,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.correo).toBe(correoSecretariaTest);
    expect(res.body.data.rol).toBe("secretaria");
    expect(res.body.data.secretaria.carreraId).toBe(carreraId);

    // Sanitización: la contraseña NUNCA debe viajar en la respuesta
    expect(res.body.data.clave).toBeUndefined();

    usuarioId = res.body.data.id;
  });

  it("Debe rechazar la creación de una secretaria sin carreraId (400)", async () => {
    const res = await request(app)
      .post("/api/usuarios")
      .set("Cookie", adminCookie)
      .send({
        nombre: "Secretaria Sin Carrera",
        correo: `sin_carrera_${Date.now()}@ubiobio.cl`,
        clave: "123456",
        rol: "secretaria",
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toContain("carreraId");
  });

  it("Debe rechazar la creación con un correo ya existente (409 Conflict)", async () => {
    const res = await request(app)
      .post("/api/usuarios")
      .set("Cookie", adminCookie)
      .send({
        nombre: "Usuario Duplicado",
        correo: correoSecretariaTest, // Mismo correo
        clave: "123456",
        rol: "admin",
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("error");
  });

  it("Debe consultar un usuario por ID de forma sanitizada (200)", async () => {
    const res = await request(app)
      .get(`/api/usuarios/${usuarioId}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.id).toBe(usuarioId);
    expect(res.body.data.clave).toBeUndefined();
  });

  it("Debe actualizar el nombre de un usuario (200)", async () => {
    const res = await request(app)
      .put(`/api/usuarios/${usuarioId}`)
      .set("Cookie", adminCookie)
      .send({
        nombre: "Secretaria Nombre Modificado",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.nombre).toBe("Secretaria Nombre Modificado");
    expect(res.body.data.clave).toBeUndefined();
  });

  it("Debe eliminar el usuario de prueba (204)", async () => {
    const res = await request(app)
      .delete(`/api/usuarios/${usuarioId}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(204);
  });
});
