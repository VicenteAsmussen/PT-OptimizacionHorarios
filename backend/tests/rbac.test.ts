import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../src/config/db.js";
import { departamentos, profesores, semestres, disponibilidadProfesores } from "../src/db/schema/index.js";
import { carrerasRepository } from "../src/repositories/carreras.repository.js";

describe("Control de Acceso y Roles (RBAC)", () => {
  let adminCookie: string[];
  let secretariaCookie: string[];
  let profesorCookie: string[];

  beforeAll(async () => {
    // 1. Obtener cookies de los 3 roles
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "admin@ubiobio.cl", clave: "123456" });
    expect(adminRes.status).toBe(200);
    adminCookie = adminRes.headers["set-cookie"];

    const secRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "secretaria@ubiobio.cl", clave: "123456" });
    expect(secRes.status).toBe(200);
    secretariaCookie = secRes.headers["set-cookie"];

    const profRes = await request(app)
      .post("/api/auth/login")
      .send({ correo: "profesor@ubiobio.cl", clave: "123456" });
    expect(profRes.status).toBe(200);
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

    it("Secretaria sincroniza profesor gestionado pero no profesor ajeno, sin efectos fuera de alcance", async () => {
      const secretaria = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "secretaria@ubiobio.cl") });
      const docente = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "profesor@ubiobio.cl") });
      expect(secretaria).toBeDefined();
      expect(docente).toBeDefined();
      const profesor = await db.query.profesores.findFirst({ where: eq(profesores.usuarioId, docente!.id) });
      expect(profesor).toBeDefined();
      const alcance = await carrerasRepository.findAlcanceByUsuarioId(secretaria!.id);
      expect(alcance?.departamentosGestionadosIds).toContain(profesor!.departamentoId);
      expect(alcance?.profesoresIds).toContain(profesor!.id);
      const bloques = await db.query.bloquesHorarios.findMany({ limit: 2 });
      expect(bloques).toHaveLength(2);
      const [semestre] = await db.insert(semestres).values({ codigo: `RB${randomUUID().slice(0, 6)}`, anio: 2026 }).returning();
      let departamentoId: number | undefined;
      let profesorAjenoId: number | undefined;
      try {
        const [departamento] = await db.insert(departamentos).values({ nombre: `RBAC ${randomUUID()}` }).returning();
        departamentoId = departamento.id;
        const [ajeno] = await db.insert(profesores).values({ departamentoId, nombre: "Docente ajeno RBAC", rut: "11111111-1", tipo: "part time" }).returning();
        profesorAjenoId = ajeno.id;
        expect(alcance?.departamentosIds).not.toContain(departamentoId);
        expect(alcance?.profesoresIds).not.toContain(ajeno.id);
        await db.insert(disponibilidadProfesores).values({ profesorId: ajeno.id, semestreId: semestre.id, bloqueId: bloques[0].id });
        const leerAjena = () => db.select().from(disponibilidadProfesores).where(and(
          eq(disponibilidadProfesores.profesorId, ajeno.id), eq(disponibilidadProfesores.semestreId, semestre.id)));
        const antes = await leerAjena();
        const permitida = await request(app).post("/api/disponibilidad-profesores/sincronizar")
          .set("Cookie", secretariaCookie).send({ profesorId: profesor!.id, semestreId: semestre.id, bloquesIds: bloques.map((bloque) => bloque.id) });
        expect(permitida.status).toBe(200);
        const guardada = await db.select().from(disponibilidadProfesores).where(and(
          eq(disponibilidadProfesores.profesorId, profesor!.id), eq(disponibilidadProfesores.semestreId, semestre.id)));
        expect(guardada.map((fila) => fila.bloqueId).sort((a, b) => a - b))
          .toEqual(bloques.map((bloque) => bloque.id).sort((a, b) => a - b));
        const prohibida = await request(app).post("/api/disponibilidad-profesores/sincronizar")
          .set("Cookie", secretariaCookie).send({ profesorId: ajeno.id, semestreId: semestre.id, bloquesIds: [bloques[1].id] });
        expect(prohibida.status).toBe(403);
        expect(await leerAjena()).toEqual(antes);
      } finally {
        // Dedicated semester: cascading cleanup never touches seeded availability.
        await db.delete(semestres).where(eq(semestres.id, semestre.id));
        if (profesorAjenoId !== undefined) await db.delete(profesores).where(eq(profesores.id, profesorAjenoId));
        if (departamentoId !== undefined) await db.delete(departamentos).where(eq(departamentos.id, departamentoId));
      }
    });

    it("Profesor sincroniza su disponibilidad en un semestre propio de la prueba (200)", async () => {
      const usuario = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "profesor@ubiobio.cl") });
      expect(usuario).toBeDefined();
      const profesor = await db.query.profesores.findFirst({ where: eq(profesores.usuarioId, usuario!.id) });
      expect(profesor).toBeDefined();
      const bloque = await db.query.bloquesHorarios.findFirst();
      expect(bloque).toBeDefined();
      const [semestre] = await db.insert(semestres).values({ codigo: `RB${randomUUID().slice(0, 6)}`, anio: 2026 }).returning();
      try {
        const res = await request(app).post("/api/disponibilidad-profesores/sincronizar")
          .set("Cookie", profesorCookie).send({ profesorId: profesor!.id, semestreId: semestre.id, bloquesIds: [bloque!.id] });
        expect(res.status).toBe(200);
        const guardada = await db.select().from(disponibilidadProfesores).where(and(
          eq(disponibilidadProfesores.profesorId, profesor!.id), eq(disponibilidadProfesores.semestreId, semestre.id)));
        expect(guardada.map((fila) => fila.bloqueId)).toEqual([bloque!.id]);
      } finally {
        await db.delete(semestres).where(eq(semestres.id, semestre.id));
      }
    });
  });
});
