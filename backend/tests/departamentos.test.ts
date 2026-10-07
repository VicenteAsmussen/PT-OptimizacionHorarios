import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Módulo Departamentos (/api/departamentos)", () => {
  let adminCookie: string[];

  beforeAll(async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ correo: "admin@ubiobio.cl", clave: "123456" });
    expect(res.status).toBe(200);
    adminCookie = res.headers["set-cookie"];
  });

  it("Debe listar los departamentos como administrador (200)", async () => {
    const res = await request(app).get("/api/departamentos").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("Debe rechazar un nombre vacío (400)", async () => {
    const res = await request(app).post("/api/departamentos")
      .set("Cookie", adminCookie).send({ nombre: " " });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe crear, consultar, actualizar y eliminar un departamento, rechazando duplicados (201/200/409/204/404)", async () => {
    const nombre = `Departamento prueba ${randomUUID()}`;
    const creacion = await request(app).post("/api/departamentos")
      .set("Cookie", adminCookie).send({ nombre });
    expect(creacion.status).toBe(201);
    const id: number = creacion.body.data.id;
    let eliminado = false;
    try {
      expect(creacion.body.status).toBe("success");
      expect(id).toEqual(expect.any(Number));
      expect(creacion.body.data.nombre).toBe(nombre);

      const duplicado = await request(app).post("/api/departamentos")
        .set("Cookie", adminCookie).send({ nombre });
      expect(duplicado.status).toBe(409);
      expect(duplicado.body.status).toBe("error");

      const consulta = await request(app).get(`/api/departamentos/${id}`).set("Cookie", adminCookie);
      expect(consulta.status).toBe(200);
      expect(consulta.body.status).toBe("success");
      expect(consulta.body.data).toMatchObject({ id, nombre });

      const actualizado = `${nombre} actualizado`;
      const actualizacion = await request(app).put(`/api/departamentos/${id}`)
        .set("Cookie", adminCookie).send({ nombre: actualizado });
      expect(actualizacion.status).toBe(200);
      expect(actualizacion.body.status).toBe("success");
      expect(actualizacion.body.data).toMatchObject({ id, nombre: actualizado });

      const eliminacion = await request(app).delete(`/api/departamentos/${id}`).set("Cookie", adminCookie);
      eliminado = eliminacion.status === 204;
      expect(eliminacion.status).toBe(204);
      expect(eliminacion.text).toBe("");
      const posterior = await request(app).get(`/api/departamentos/${id}`).set("Cookie", adminCookie);
      expect(posterior.status).toBe(404);
      expect(posterior.body.status).toBe("error");
    } finally {
      if (!eliminado) {
        const limpieza = await request(app).delete(`/api/departamentos/${id}`).set("Cookie", adminCookie);
        expect(limpieza.status).toBe(204);
      }
    }
  });
});
