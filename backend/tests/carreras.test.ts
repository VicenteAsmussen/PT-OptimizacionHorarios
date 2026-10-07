import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Módulo Carreras (/api/carreras)", () => {
  let secretariaCookie: string[];

  beforeAll(async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    expect(res.status).toBe(200);
    secretariaCookie = res.headers["set-cookie"];
  });

  it("Debe listar las carreras como secretaria (200)", async () => {
    const res = await request(app).get("/api/carreras").set("Cookie", secretariaCookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("Debe rechazar consultas sin autenticación (401)", async () => {
    const res = await request(app).get("/api/carreras");
    expect(res.status).toBe(401);
  });

  it("Debe rechazar un nombre vacío (400)", async () => {
    const res = await request(app).post("/api/carreras")
      .set("Cookie", secretariaCookie).send({ nombre: " " });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe crear, consultar, actualizar y eliminar una carrera, rechazando duplicados (201/200/409/204/404)", async () => {
    const nombre = `Carrera prueba ${randomUUID()}`;
    const creacion = await request(app).post("/api/carreras")
      .set("Cookie", secretariaCookie).send({ nombre });
    expect(creacion.status).toBe(201);
    const id: number = creacion.body.data.id;
    let eliminada = false;
    try {
      expect(creacion.body.status).toBe("success");
      expect(id).toEqual(expect.any(Number));
      expect(creacion.body.data.nombre).toBe(nombre);

      const duplicado = await request(app).post("/api/carreras")
        .set("Cookie", secretariaCookie).send({ nombre });
      expect(duplicado.status).toBe(409);
      expect(duplicado.body.status).toBe("error");

      const consulta = await request(app).get(`/api/carreras/${id}`).set("Cookie", secretariaCookie);
      expect(consulta.status).toBe(200);
      expect(consulta.body.status).toBe("success");
      expect(consulta.body.data).toMatchObject({ id, nombre });

      const actualizado = `${nombre} actualizada`;
      const actualizacion = await request(app).put(`/api/carreras/${id}`)
        .set("Cookie", secretariaCookie).send({ nombre: actualizado });
      expect(actualizacion.status).toBe(200);
      expect(actualizacion.body.status).toBe("success");
      expect(actualizacion.body.data).toMatchObject({ id, nombre: actualizado });

      const eliminacion = await request(app).delete(`/api/carreras/${id}`).set("Cookie", secretariaCookie);
      eliminada = eliminacion.status === 204;
      expect(eliminacion.status).toBe(204);
      expect(eliminacion.text).toBe("");
      const posterior = await request(app).get(`/api/carreras/${id}`).set("Cookie", secretariaCookie);
      expect(posterior.status).toBe(404);
      expect(posterior.body.status).toBe("error");
    } finally {
      if (!eliminada) {
        const limpieza = await request(app).delete(`/api/carreras/${id}`).set("Cookie", secretariaCookie);
        expect(limpieza.status).toBe(204);
      }
    }
  });
});
