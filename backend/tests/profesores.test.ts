import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Módulo Profesores (/api/profesores)", () => {
  let adminCookie: string[];

  beforeAll(async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ correo: "admin@ubiobio.cl", clave: "123456" });
    expect(res.status).toBe(200);
    adminCookie = res.headers["set-cookie"];
  });

  it("Debe listar los profesores como administrador (200)", async () => {
    const res = await request(app).get("/api/profesores").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("Debe rechazar la creación sin departamento ni tipo de jornada (400)", async () => {
    const res = await request(app).post("/api/profesores").set("Cookie", adminCookie)
      .send({ nombre: `Profesor inválido ${randomUUID()}` });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe crear, consultar, actualizar y eliminar un profesor (201/200/204/404)", async () => {
    const departamentos = await request(app).get("/api/departamentos").set("Cookie", adminCookie);
    expect(departamentos.status).toBe(200);
    expect(departamentos.body.data.length).toBeGreaterThan(0);
    const departamentoId: number = departamentos.body.data[0].id;
    const nombre = `Profesor prueba ${randomUUID()}`;
    const datos = { nombre, departamentoId, tipo: "Jornada completa" };
    const creacion = await request(app).post("/api/profesores").set("Cookie", adminCookie).send(datos);
    expect(creacion.status).toBe(201);
    const id: number = creacion.body.data.id;
    let eliminado = false;
    try {
      expect(creacion.body.status).toBe("success");
      expect(id).toEqual(expect.any(Number));
      expect(creacion.body.data).toMatchObject(datos);

      const consulta = await request(app).get(`/api/profesores/${id}`).set("Cookie", adminCookie);
      expect(consulta.status).toBe(200);
      expect(consulta.body.status).toBe("success");
      expect(consulta.body.data).toMatchObject({ id, ...datos });

      const cambios = { nombre: `${nombre} actualizado`, tipo: "Media jornada" };
      const actualizacion = await request(app).put(`/api/profesores/${id}`)
        .set("Cookie", adminCookie).send(cambios);
      expect(actualizacion.status).toBe(200);
      expect(actualizacion.body.status).toBe("success");
      expect(actualizacion.body.data).toMatchObject({ id, departamentoId, ...cambios });

      const eliminacion = await request(app).delete(`/api/profesores/${id}`).set("Cookie", adminCookie);
      eliminado = eliminacion.status === 204;
      expect(eliminacion.status).toBe(204);
      expect(eliminacion.text).toBe("");
      const posterior = await request(app).get(`/api/profesores/${id}`).set("Cookie", adminCookie);
      expect(posterior.status).toBe(404);
      expect(posterior.body.status).toBe("error");
    } finally {
      if (!eliminado) {
        const limpieza = await request(app).delete(`/api/profesores/${id}`).set("Cookie", adminCookie);
        expect(limpieza.status).toBe(204);
      }
    }
  });
});
