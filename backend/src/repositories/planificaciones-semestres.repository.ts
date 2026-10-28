import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { planificacionesSemestres, type NuevaPlanificacionSemestre } from "../db/schema/planificaciones-semestres.schema.js";
import { carreras } from "../db/schema/carreras.schema.js";
import { profesores } from "../db/schema/profesores.schema.js";
import { carreraDepartamento } from "../db/schema/carrera-departamento.schema.js";
import { carreraAsignatura } from "../db/schema/carrera-asignatura.schema.js";
import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import type { TransaccionPlanificacion } from "./planificacion-escritura.js";

// Reuse the metadata lock protocol for explicit deletion. Ordinary entry writes
// still use conPlanificacionesEditables and its current/preparation guards.
async function conPeriodoBloqueado<T>(id: number, carreraId: number,
  ejecutar: (tx: TransaccionPlanificacion, planificacion: typeof planificacionesSemestres.$inferSelect) => Promise<T>) {
  return db.transaction(async tx => {
    await tx.select({ id: carreras.id }).from(carreras).where(eq(carreras.id, carreraId)).for("update");
    const [planificacion] = await tx.select().from(planificacionesSemestres)
      .where(and(eq(planificacionesSemestres.id, id), eq(planificacionesSemestres.carreraId, carreraId))).for("update");
    if (!planificacion || planificacion.carreraId !== carreraId) throw new NotFoundError("Planificación no encontrada");
    return ejecutar(tx, planificacion);
  }, { isolationLevel: "read committed" });
}

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
      const [carrera] = await tx.select({ id: carreras.id }).from(carreras).where(eq(carreras.id, datos.carreraId)).for("update");
      if (!carrera) throw new NotFoundError("Carrera no encontrada");
      // Check after the career lock and before writes, independent of driver error metadata.
      const [existente] = await tx.select({ id: planificacionesSemestres.id }).from(planificacionesSemestres)
        .where(and(eq(planificacionesSemestres.carreraId, datos.carreraId), eq(planificacionesSemestres.codigo, datos.codigo))).limit(1);
      if (existente) throw new ConflictError("Período existente");
      await tx.update(planificacionesSemestres).set({ actual: false }).where(eq(planificacionesSemestres.carreraId, datos.carreraId));
      const [creada] = await tx.insert(planificacionesSemestres).values({ ...datos, actual: true, estadoPlanificacion: "preparacion" }).returning();
      return creada;
    });
  },
  async update(id: number, carreraId: number, datos: Partial<Pick<NuevaPlanificacionSemestre, "codigo" | "actual">>) {
    return conPeriodoBloqueado(id, carreraId, async (tx, planificacion) => {
      if (planificacion.estadoPlanificacion !== "preparacion" && (datos.codigo !== undefined || datos.actual === undefined)) {
        throw new ConflictError("Solo se puede modificar una planificación en preparación");
      }
      if (datos.actual) await tx.update(planificacionesSemestres).set({ actual: false }).where(eq(planificacionesSemestres.carreraId, carreraId));
      const [actualizada] = await tx.update(planificacionesSemestres).set(datos).where(and(eq(planificacionesSemestres.id, id), eq(planificacionesSemestres.carreraId, carreraId))).returning();
      return actualizada;
    });
  },
  async delete(id: number, carreraId: number, confirmacion: string) {
    return conPeriodoBloqueado(id, carreraId, async (tx, planificacion) => {
      if (confirmacion !== planificacion.codigo) throw new ConflictError("El código cambió o la confirmación no coincide. Consulta y confirma nuevamente el período");
      if (planificacion.estadoPlanificacion !== "preparacion") throw new ConflictError("Solo se puede eliminar un período en preparación");
      const [oferta] = await tx.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas)
        .where(eq(ofertasAsignaturas.planificacionSemestreId, id)).limit(1);
      if (oferta) throw new ConflictError("Solo se puede eliminar un período sin ofertas de ningún departamento");
      // Availability cascades via its existing FK. No offer/schedule cleanup and
      // no replacement current period: the schedule FK requires an offer here.
      const [eliminada] = await tx.delete(planificacionesSemestres)
        .where(and(eq(planificacionesSemestres.id, id), eq(planificacionesSemestres.carreraId, carreraId))).returning();
      return eliminada;
    });
  },
  // Subconsulta reutilizable: la pertenencia de una asignatura compartida no determina al dueño.
  idsEnCarrera(alcance: AlcanceCarrera) {
    return db.select({ id: planificacionesSemestres.id }).from(planificacionesSemestres).where(eq(planificacionesSemestres.carreraId, alcance.carreraId));
  },
};
