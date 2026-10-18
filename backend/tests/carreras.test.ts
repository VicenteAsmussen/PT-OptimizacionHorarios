import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Módulo Carreras (/api/carreras)", () => {
  let secretariaCookie: string[];
  let adminCookie: string[];

  beforeAll(async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    expect(res.status).toBe(200);
    secretariaCookie = res.headers["set-cookie"];
    const admin = await request(app).post("/api/auth/login")
      .send({ correo: "admin@ubiobio.cl", clave: "123456" });
    expect(admin.status).toBe(200);
    adminCookie = admin.headers["set-cookie"];
  });

  it("Debe listar solo la carrera de la secretaria (200)", async () => {
    const res = await request(app).get("/api/carreras").set("Cookie", secretariaCookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.map((carrera: { nombre: string }) => carrera.nombre))
      .toEqual(["Ingeniería Civil en Informática"]);
  });

  it("Debe rechazar consultas sin autenticación (401)", async () => {
    const res = await request(app).get("/api/carreras");
    expect(res.status).toBe(401);
  });

  it("Debe rechazar un nombre vacío como admin (400)", async () => {
    const res = await request(app).post("/api/carreras")
      .set("Cookie", adminCookie).send({ nombre: " " });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("Debe crear y actualizar relaciones carrera-departamento con marca gestionada", async () => {
    const departamentos = await request(app).get("/api/departamentos").set("Cookie", adminCookie);
    expect(departamentos.status).toBe(200);
    expect(departamentos.body.data.length).toBeGreaterThanOrEqual(2);
    const [primerDepartamento, segundoDepartamento] = departamentos.body.data;
    const nombre = `Carrera departamentos ${randomUUID()}`;
    const creacion = await request(app).post("/api/carreras")
      .set("Cookie", adminCookie)
      .send({ nombre, departamentosIds: [primerDepartamento.id, segundoDepartamento.id],
        departamentosGestionadosIds: [primerDepartamento.id] });
    expect(creacion.status).toBe(201);
    const id: number = creacion.body.data.id;
    let eliminada = false;
    try {
      expect(creacion.body.data.carreraDepartamentos).toEqual(expect.arrayContaining([
        expect.objectContaining({ departamentoId: primerDepartamento.id, esGestionado: true }),
        expect.objectContaining({ departamentoId: segundoDepartamento.id, esGestionado: false }),
      ]));
      const actualizacion = await request(app).put(`/api/carreras/${id}`)
        .set("Cookie", adminCookie).send({ departamentosGestionadosIds: [segundoDepartamento.id] });
      expect(actualizacion.status).toBe(200);
      expect(actualizacion.body.data.carreraDepartamentos).toEqual(expect.arrayContaining([
        expect.objectContaining({ departamentoId: primerDepartamento.id, esGestionado: false }),
        expect.objectContaining({ departamentoId: segundoDepartamento.id, esGestionado: true }),
      ]));
      const gestionadoSinRelacion = await request(app).put(`/api/carreras/${id}`)
        .set("Cookie", adminCookie)
        .send({ departamentosIds: [primerDepartamento.id], departamentosGestionadosIds: [segundoDepartamento.id] });
      expect(gestionadoSinRelacion.status).toBe(400);
      expect(gestionadoSinRelacion.body.status).toBe("error");
      const remocion = await request(app).put(`/api/carreras/${id}`)
        .set("Cookie", adminCookie).send({ departamentosIds: [primerDepartamento.id] });
      expect(remocion.status).toBe(200);
      expect(remocion.body.data.carreraDepartamentos).toEqual([
        expect.objectContaining({ departamentoId: primerDepartamento.id, esGestionado: false }),
      ]);
      const eliminacion = await request(app).delete(`/api/carreras/${id}`).set("Cookie", adminCookie);
      eliminada = eliminacion.status === 204;
      expect(eliminacion.status).toBe(204);
    } finally {
      if (!eliminada) {
        const limpieza = await request(app).delete(`/api/carreras/${id}`).set("Cookie", adminCookie);
        expect(limpieza.status).toBe(204);
      }
    }
  });

  it("Admin realiza CRUD y rechaza duplicados; secretaria no puede mutar ni deja efectos", async () => {
    const nombre = `Carrera prueba ${randomUUID()}`;
    const creacion = await request(app).post("/api/carreras").set("Cookie", adminCookie).send({ nombre });
    expect(creacion.status).toBe(201);
    const id: number = creacion.body.data.id;
    let eliminada = false;
    try {
      expect(creacion.body.status).toBe("success");
      expect(id).toEqual(expect.any(Number));
      expect(creacion.body.data.nombre).toBe(nombre);
      const antes = await request(app).get("/api/carreras").set("Cookie", adminCookie);
      expect(antes.status).toBe(200);
      const prohibida = await request(app).post("/api/carreras")
        .set("Cookie", secretariaCookie).send({ nombre: `${nombre} prohibida` });
      expect(prohibida.status).toBe(403);
      const edicionProhibida = await request(app).put(`/api/carreras/${id}`)
        .set("Cookie", secretariaCookie).send({ nombre: `${nombre} prohibida` });
      expect(edicionProhibida.status).toBe(403);
      const borradoProhibido = await request(app).delete(`/api/carreras/${id}`).set("Cookie", secretariaCookie);
      expect(borradoProhibido.status).toBe(403);
      const despues = await request(app).get("/api/carreras").set("Cookie", adminCookie);
      expect(despues.status).toBe(200);
      expect(despues.body.data).toEqual(antes.body.data);
      const duplicado = await request(app).post("/api/carreras").set("Cookie", adminCookie).send({ nombre });
      expect(duplicado.status).toBe(409);
      expect(duplicado.body.status).toBe("error");
      const consulta = await request(app).get(`/api/carreras/${id}`).set("Cookie", adminCookie);
      expect(consulta.status).toBe(200);
      expect(consulta.body.status).toBe("success");
      expect(consulta.body.data).toMatchObject({ id, nombre });
      const ocultada = await request(app).get(`/api/carreras/${id}`).set("Cookie", secretariaCookie);
      expect(ocultada.status).toBe(404);
      const actualizado = `${nombre} actualizada`;
      const actualizacion = await request(app).put(`/api/carreras/${id}`)
        .set("Cookie", adminCookie).send({ nombre: actualizado });
      expect(actualizacion.status).toBe(200);
      expect(actualizacion.body.status).toBe("success");
      expect(actualizacion.body.data).toMatchObject({ id, nombre: actualizado });
      const eliminacion = await request(app).delete(`/api/carreras/${id}`).set("Cookie", adminCookie);
      eliminada = eliminacion.status === 204;
      expect(eliminacion.status).toBe(204);
      expect(eliminacion.text).toBe("");
      const posterior = await request(app).get(`/api/carreras/${id}`).set("Cookie", adminCookie);
      expect(posterior.status).toBe(404);
      expect(posterior.body.status).toBe("error");
    } finally {
      if (!eliminada) {
        const limpieza = await request(app).delete(`/api/carreras/${id}`).set("Cookie", adminCookie);
        expect(limpieza.status).toBe(204);
      }
    }
  });
});
