import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Módulo Salas (/api/salas)", () => {
  let secretariaCookie: string[];
  let profesorCookie: string[];

  beforeAll(async () => {
    const secretaria = await request(app).post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    expect(secretaria.status).toBe(200);
    secretariaCookie = secretaria.headers["set-cookie"];
    const profesor = await request(app).post("/api/auth/login")
      .send({ correo: "profesor@ubiobio.cl", clave: "123456" });
    expect(profesor.status).toBe(200);
    profesorCookie = profesor.headers["set-cookie"];
  });

  it("Debe listar las salas como secretaria (200)", async () => {
    const res = await request(app).get("/api/salas").set("Cookie", secretariaCookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("Debe impedir que un profesor cree una sala (403)", async () => {
    const res = await request(app).post("/api/salas").set("Cookie", profesorCookie)
      .send({ nombre: `Sala denegada ${randomUUID()}`, capacidad: 30, tipo: "Sala" });
    expect(res.status).toBe(403);
    expect(res.body.status).toBe("error");
  });

  it.each([
    { capacidad: 0, tipo: "Sala" },
    { capacidad: 30, tipo: "Auditorio" },
  ])("Debe rechazar capacidad o tipo inválidos: %j (400)", async (datos) => {
    const res = await request(app).post("/api/salas").set("Cookie", secretariaCookie)
      .send({ nombre: `Sala inválida ${randomUUID()}`, ...datos });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe crear, consultar, actualizar y eliminar una sala, rechazando duplicados (201/200/409/204/404)", async () => {
    const nombre = `Sala prueba ${randomUUID()}`;
    const datos = { nombre, capacidad: 30, tipo: "Sala" };
    const creacion = await request(app).post("/api/salas")
      .set("Cookie", secretariaCookie).send(datos);
    expect(creacion.status).toBe(201);
    const id: number = creacion.body.data.id;
    let eliminada = false;
    try {
      expect(creacion.body.status).toBe("success");
      expect(id).toEqual(expect.any(Number));
      expect(creacion.body.data).toMatchObject(datos);

      const duplicado = await request(app).post("/api/salas")
        .set("Cookie", secretariaCookie).send(datos);
      expect(duplicado.status).toBe(409);
      expect(duplicado.body.status).toBe("error");

      const consulta = await request(app).get(`/api/salas/${id}`).set("Cookie", secretariaCookie);
      expect(consulta.status).toBe(200);
      expect(consulta.body.status).toBe("success");
      expect(consulta.body.data).toMatchObject({ id, ...datos });

      const cambios = { nombre: `${nombre} actualizada`, capacidad: 45, tipo: "Laboratorio" };
      const actualizacion = await request(app).put(`/api/salas/${id}`)
        .set("Cookie", secretariaCookie).send(cambios);
      expect(actualizacion.status).toBe(200);
      expect(actualizacion.body.status).toBe("success");
      expect(actualizacion.body.data).toMatchObject({ id, ...cambios });

      const eliminacion = await request(app).delete(`/api/salas/${id}`).set("Cookie", secretariaCookie);
      eliminada = eliminacion.status === 204;
      expect(eliminacion.status).toBe(204);
      expect(eliminacion.text).toBe("");
      const posterior = await request(app).get(`/api/salas/${id}`).set("Cookie", secretariaCookie);
      expect(posterior.status).toBe(404);
      expect(posterior.body.status).toBe("error");
    } finally {
      if (!eliminada) {
        const limpieza = await request(app).delete(`/api/salas/${id}`).set("Cookie", secretariaCookie);
        expect(limpieza.status).toBe(204);
      }
    }
  });
});
