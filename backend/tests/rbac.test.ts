import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { habilitarPruebasIntegracion } from "./soporte/base-pruebas.js";
import { randomInt, randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { departamentos, profesores, planificacionesSemestres, disponibilidadProfesores } from "../src/db/schema/index.js";
import { normalizarRut } from "../src/utils/rut.js";

const ejecutarIntegracion = habilitarPruebasIntegracion(process.env);
const app = ejecutarIntegracion ? (await import("../src/app.js")).app : undefined!;
const db = ejecutarIntegracion ? (await import("../src/config/db.js")).db : undefined!;
const carrerasRepository = ejecutarIntegracion
  ? (await import("../src/repositories/carreras.repository.js")).carrerasRepository : undefined!;

async function rutDisponible() {
  for (let intento = 0; intento < 20; intento++) {
    const cuerpo = randomInt(80_000_000, 100_000_000);
    const rut = [..."0123456789K"].map(digito => `${cuerpo}-${digito}`).find(candidato => normalizarRut(candidato) !== null)!;
    const existente = await db.query.profesores.findFirst({ where: eq(profesores.rut, rut), columns: { id: true } });
    if (!existente) return rut;
  }
  throw new Error("No se pudo obtener un RUT sintético libre para la prueba");
}

// Cada caso usa su propia preparación actual y devuelve la vigencia del seed sin cambiar su estado.
async function crearPlanificacionActual(carreraId: number, codigo: string) {
  const anterior = await db.query.planificacionesSemestres.findFirst({
    where: and(eq(planificacionesSemestres.carreraId, carreraId), eq(planificacionesSemestres.actual, true)),
  });
  const planificacion = await db.transaction(async (tx) => {
    await tx.update(planificacionesSemestres).set({ actual: false }).where(eq(planificacionesSemestres.carreraId, carreraId));
    const [propia] = await tx.insert(planificacionesSemestres).values({ carreraId, codigo, actual: true, estadoPlanificacion: "preparacion" }).returning();
    return propia;
  });
  const restaurar = () => db.transaction(async (tx) => {
    await tx.delete(planificacionesSemestres).where(eq(planificacionesSemestres.id, planificacion.id));
    if (anterior) await tx.update(planificacionesSemestres).set({ actual: true }).where(eq(planificacionesSemestres.id, anterior.id));
  });
  return { planificacion, restaurar };
}

describe.skipIf(!ejecutarIntegracion)("Control de Acceso y Roles (RBAC)", () => {
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
      .send({ correo: "cvidal@ubb.cl", clave: "123456" });
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
    it("Profesor no puede consultar el listado general de horarios (403)", async () => {
      const res = await request(app)
        .get("/api/horarios-asignaturas")
        .set("Cookie", profesorCookie);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe("error");
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

    it("Secretaría no sincroniza disponibilidad propia de la carrera ni ajena, sin modificar datos", async () => {
      const secretaria = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "secretaria@ubiobio.cl") });
      const docente = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "cvidal@ubb.cl") });
      expect(secretaria).toBeDefined();
      expect(docente).toBeDefined();
      const profesor = await db.query.profesores.findFirst({ where: eq(profesores.usuarioId, docente!.id) });
      expect(profesor).toBeDefined();
      const alcance = await carrerasRepository.findAlcanceByUsuarioId(secretaria!.id);
      expect(alcance?.departamentosGestionadosIds).toContain(profesor!.departamentoId);
      expect(alcance?.profesoresIds).toContain(profesor!.id);
      const bloques = await db.query.bloquesHorarios.findMany({ limit: 2 });
      expect(bloques).toHaveLength(2);
      const { planificacion, restaurar } = await crearPlanificacionActual(alcance!.carreraId, "2094-1");
      let departamentoId: number | undefined;
      let profesorAjenoId: number | undefined;
      try {
        const [departamento] = await db.insert(departamentos).values({ nombre: `RBAC ${randomUUID()}` }).returning();
        departamentoId = departamento.id;
        const [ajeno] = await db.insert(profesores).values({ departamentoId, nombre: "Docente ajeno RBAC", rut: await rutDisponible(), tipo: "part time" }).returning();
        profesorAjenoId = ajeno.id;
        expect(alcance?.departamentosIds).not.toContain(departamentoId);
        expect(alcance?.profesoresIds).not.toContain(ajeno.id);
        await db.insert(disponibilidadProfesores).values({ profesorId: ajeno.id, planificacionSemestreId: planificacion.id, bloqueId: bloques[0].id });
        const leerAjena = () => db.select().from(disponibilidadProfesores).where(and(
          eq(disponibilidadProfesores.profesorId, ajeno.id), eq(disponibilidadProfesores.planificacionSemestreId, planificacion.id)));
        const antes = await leerAjena();
        const leerGestionada = () => db.select().from(disponibilidadProfesores).where(and(
          eq(disponibilidadProfesores.profesorId, profesor!.id), eq(disponibilidadProfesores.planificacionSemestreId, planificacion.id)));
        const gestionadaAntes = await leerGestionada();
        const gestionada = await request(app).post("/api/disponibilidad-profesores/sincronizar")
          .set("Cookie", secretariaCookie).send({ profesorId: profesor!.id, planificacionSemestreId: planificacion.id, bloquesIds: bloques.map((bloque) => bloque.id) });
        expect(gestionada.status).toBe(403);
        expect(await leerGestionada()).toEqual(gestionadaAntes);
        const prohibida = await request(app).post("/api/disponibilidad-profesores/sincronizar")
          .set("Cookie", secretariaCookie).send({ profesorId: ajeno.id, planificacionSemestreId: planificacion.id, bloquesIds: [bloques[1].id] });
        expect(prohibida.status).toBe(403);
        expect(await leerAjena()).toEqual(antes);
      } finally {
        // Planificación dedicada: la limpieza no toca disponibilidad del seed.
        await restaurar();
        if (profesorAjenoId !== undefined) await db.delete(profesores).where(eq(profesores.id, profesorAjenoId));
        if (departamentoId !== undefined) await db.delete(departamentos).where(eq(departamentos.id, departamentoId));
      }
    });

    it("Profesor no utiliza la sincronización general ni altera disponibilidad guardada (403)", async () => {
      const usuario = await db.query.usuarios.findFirst({ where: (tabla, { eq }) => eq(tabla.correo, "cvidal@ubb.cl") });
      expect(usuario).toBeDefined();
      const profesor = await db.query.profesores.findFirst({ where: eq(profesores.usuarioId, usuario!.id) });
      expect(profesor).toBeDefined();
      const bloques = await db.query.bloquesHorarios.findMany({ limit: 2 });
      expect(bloques).toHaveLength(2);
      const relacion = await db.query.carreraDepartamento.findFirst({ where: (tabla, { eq }) => eq(tabla.departamentoId, profesor!.departamentoId) });
      expect(relacion).toBeDefined();
      const { planificacion, restaurar } = await crearPlanificacionActual(relacion!.carreraId, "2094-2");
      try {
        await db.insert(disponibilidadProfesores).values({ profesorId: profesor!.id, planificacionSemestreId: planificacion.id, bloqueId: bloques[0].id });
        const leerGuardada = () => db.select().from(disponibilidadProfesores).where(and(
          eq(disponibilidadProfesores.profesorId, profesor!.id), eq(disponibilidadProfesores.planificacionSemestreId, planificacion.id)));
        const antes = await leerGuardada();
        expect(await db.query.ofertasAsignaturas.findMany({ where: (tabla, { eq }) => eq(tabla.planificacionSemestreId, planificacion.id) })).toEqual([]);
        const res = await request(app).post("/api/disponibilidad-profesores/sincronizar")
          .set("Cookie", profesorCookie).send({ profesorId: profesor!.id, planificacionSemestreId: planificacion.id, bloquesIds: [bloques[1].id] });
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ status: "error", statusCode: 403 });
        expect(await leerGuardada()).toEqual(antes);
        expect(await db.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, planificacion.id) })).toEqual(planificacion);
      } finally {
        await restaurar();
      }
    });
  });
});
