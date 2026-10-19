import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { planificacionesSemestres, type NuevaPlanificacionSemestre } from "../db/schema/planificaciones-semestres.schema.js";
import { carreras } from "../db/schema/carreras.schema.js";
import { profesores } from "../db/schema/profesores.schema.js";
import { carreraDepartamento } from "../db/schema/carrera-departamento.schema.js";
import { carreraAsignatura } from "../db/schema/carrera-asignatura.schema.js";
import type { AlcanceCarrera } from "../utils/alcance-carrera.js";

export const planificacionesSemestresRepository = {
  async findAll(carreraId?: number, profesorUsuarioId?: number) {
    const carrerasProfesor = profesorUsuarioId === undefined ? undefined : db.select({ id: carreraDepartamento.carreraId })
      .from(carreraDepartamento).innerJoin(profesores, eq(profesores.departamentoId, carreraDepartamento.departamentoId))
      .where(eq(profesores.usuarioId, profesorUsuarioId));
    return db.query.planificacionesSemestres.findMany({
      where: and(carreraId === undefined ? undefined : eq(planificacionesSemestres.carreraId, carreraId),
        carrerasProfesor ? inArray(planificacionesSemestres.carreraId, carrerasProfesor) : undefined),
      with: { carrera: true },
    });
  },
  async findById(id: number) {
    return db.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id), with: { carrera: true } });
  },
  async findProfesorByUsuarioId(usuarioId: number) {
    return db.query.profesores.findFirst({ where: eq(profesores.usuarioId, usuarioId), columns: { id: true, departamentoId: true } });
  },
  async profesorAutorizado(carreraId: number, departamentoId: number) {
    const [relacion] = await db.select({ id: carreraDepartamento.carreraId }).from(carreraDepartamento)
      .where(and(eq(carreraDepartamento.carreraId, carreraId), eq(carreraDepartamento.departamentoId, departamentoId))).limit(1);
    return !!relacion;
  },
  async asignaturaPertenece(carreraId: number, codigo: string) {
    const [relacion] = await db.select({ id: carreraAsignatura.carreraId }).from(carreraAsignatura)
      .where(and(eq(carreraAsignatura.carreraId, carreraId), eq(carreraAsignatura.asignaturaCodigo, codigo))).limit(1);
    return !!relacion;
  },
  async create(datos: NuevaPlanificacionSemestre) {
    return db.transaction(async tx => {
      // Serializar la selección de periodo actual sobre su carrera, no globalmente.
      await tx.select({ id: carreras.id }).from(carreras).where(eq(carreras.id, datos.carreraId)).for("update");
      if (datos.actual) await tx.update(planificacionesSemestres).set({ actual: false }).where(eq(planificacionesSemestres.carreraId, datos.carreraId));
      const [creada] = await tx.insert(planificacionesSemestres).values(datos).returning();
      return creada;
    });
  },
  async update(id: number, carreraId: number, datos: Partial<Pick<NuevaPlanificacionSemestre, "codigo" | "anio" | "actual">>) {
    return db.transaction(async tx => {
      await tx.select({ id: carreras.id }).from(carreras).where(eq(carreras.id, carreraId)).for("update");
      if (datos.actual) await tx.update(planificacionesSemestres).set({ actual: false }).where(eq(planificacionesSemestres.carreraId, carreraId));
      const [actualizada] = await tx.update(planificacionesSemestres).set(datos).where(and(eq(planificacionesSemestres.id, id), eq(planificacionesSemestres.carreraId, carreraId))).returning();
      return actualizada;
    });
  },
  // Subconsulta reutilizable: la pertenencia de una asignatura compartida no determina al dueño.
  idsEnCarrera(alcance: AlcanceCarrera) {
    return db.select({ id: planificacionesSemestres.id }).from(planificacionesSemestres).where(eq(planificacionesSemestres.carreraId, alcance.carreraId));
  },
};
