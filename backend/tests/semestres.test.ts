import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Módulo Semestres (/api/semestres)", () => {
  let secretariaCookie: string[];
  let profesorCookie: string[];
  let semestreId1: number;
  let semestreId2: number;

  beforeAll(async () => {
    // Iniciar sesión como secretaria y profesor
    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    secretariaCookie = secRes.headers["set-cookie"];

    const profRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "profesor@ubiobio.cl", clave: "123456" });
    profesorCookie = profRes.headers["set-cookie"];

    // Obtener semestres existentes
    const semsRes = await request(app)
      .get("/api/semestres")
      .set("Cookie", secretariaCookie);
    semestreId1 = semsRes.body.data[0].id;
    semestreId2 = semsRes.body.data[1].id;
  });

  it("Debe consultar el semestre actual con GET /api/semestres/actual (200)", async () => {
    const res = await request(app)
      .get("/api/semestres/actual")
      .set("Cookie", profesorCookie); // El profesor también puede consultar el actual

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.actual).toBe(true);
  });

  it("Secretaria puede activar un semestre diferente como actual con PATCH /:id/activar (200)", async () => {
    // 1. Activar semestre 2
    const patchRes = await request(app)
      .patch(`/api/semestres/${semestreId2}/activar`)
      .set("Cookie", secretariaCookie);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("success");
    expect(patchRes.body.data.id).toBe(semestreId2);
    expect(patchRes.body.data.actual).toBe(true);

    // 2. Verificar que el nuevo actual es el semestre 2
    const actualRes = await request(app)
      .get("/api/semestres/actual")
      .set("Cookie", profesorCookie);

    expect(actualRes.body.data.id).toBe(semestreId2);

    // 3. Restaurar semestre 1 como actual
    await request(app)
      .patch(`/api/semestres/${semestreId1}/activar`)
      .set("Cookie", secretariaCookie);
  });

  it("Profesor NO puede activar semestres (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/semestres/${semestreId2}/activar`)
      .set("Cookie", profesorCookie);

    expect(res.status).toBe(403);
  });

  it("Debe crear un semestre sin campo 'nombre' y con horarioPublicado=false por defecto (201)", async () => {
    const nuevoCodigo = `2099-${Date.now().toString().slice(-3)}`;
    const res = await request(app)
      .post("/api/semestres")
      .set("Cookie", secretariaCookie)
      .send({
        codigo: nuevoCodigo,
        anio: 2099,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.codigo).toBe(nuevoCodigo);
    expect(res.body.data.horarioPublicado).toBe(false);

    const nuevoId = res.body.data.id;

    // Secretaría publica el horario del semestre
    const patchRes = await request(app)
      .patch(`/api/semestres/${nuevoId}`)
      .set("Cookie", secretariaCookie)
      .send({ horarioPublicado: true });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.horarioPublicado).toBe(true);

    // Limpiar semestre de prueba
    await request(app)
      .delete(`/api/semestres/${nuevoId}`)
      .set("Cookie", secretariaCookie);
  });
});
