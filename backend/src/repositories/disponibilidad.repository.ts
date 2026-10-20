import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { disponibilidadProfesores, type NuevaDisponibilidadProfesor } from "../db/schema/disponibilidad-profesores.schema.js";
import { profesores, columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import { bloquesHorarios } from "../db/schema/bloques-horarios.schema.js";
import { horariosAsignaturas } from "../db/schema/horarios-asignaturas.schema.js";
import { planificacionesSemestresRepository } from "./planificaciones-semestres.repository.js";
import { conPlanificacionesEditables } from "./planificacion-escritura.js";
import { NotFoundError } from "../utils/errors.js";

const relacionesDisponibilidad = { profesor: { columns: columnasProfesorSinRut }, planificacionSemestre: true as const, bloque: true as const };
export const disponibilidadRepository = {
  async findAll(filtro?: { profesorId?: number; planificacionSemestreId?: number }, alcance?: AlcanceCarrera) {
    return db.query.disponibilidadProfesores.findMany({
      where: and(
        alcance ? inArray(disponibilidadProfesores.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)) : undefined,
        filtro?.profesorId ? eq(disponibilidadProfesores.profesorId, filtro.profesorId) : undefined,
        filtro?.planificacionSemestreId ? eq(disponibilidadProfesores.planificacionSemestreId, filtro.planificacionSemestreId) : undefined,
      ), with: relacionesDisponibilidad,
    });
  },
  async findById(id: number) {
    return db.query.disponibilidadProfesores.findFirst({ where: eq(disponibilidadProfesores.id, id), with: relacionesDisponibilidad });
  },
  async findSpecific(profesorId: number, planificacionSemestreId: number, bloqueId: number) {
    return db.query.disponibilidadProfesores.findFirst({ where: and(eq(disponibilidadProfesores.profesorId, profesorId), eq(disponibilidadProfesores.planificacionSemestreId, planificacionSemestreId), eq(disponibilidadProfesores.bloqueId, bloqueId)) });
  },
  async checkProfesorExists(id: number) {
    return !!await db.query.profesores.findFirst({ where: eq(profesores.id, id), columns: { id: true } });
  },
  async checkHorariosExistForPlanificacion(planificacionSemestreId: number) {
    return !!await db.query.horariosAsignaturas.findFirst({ where: eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId), columns: { id: true } });
  },
  async checkBloqueExists(id: number) {
    return !!await db.query.bloquesHorarios.findFirst({ where: eq(bloquesHorarios.id, id) });
  },
  async findExistingBloquesIds(ids: number[]) {
    if (!ids.length) return [];
    return (await db.select({ id: bloquesHorarios.id }).from(bloquesHorarios).where(inArray(bloquesHorarios.id, ids))).map(fila => fila.id);
  },
  async create(datos: NuevaDisponibilidadProfesor) {
    return conPlanificacionesEditables(async () => [datos.planificacionSemestreId], async tx => {
      const [creada] = await tx.insert(disponibilidadProfesores).values(datos).returning();
      return creada;
    });
  },
  async syncDisponibilidad(profesorId: number, planificacionSemestreId: number, bloquesIds: number[]) {
    return conPlanificacionesEditables(async () => [planificacionSemestreId], async tx => {
      const condicion = and(eq(disponibilidadProfesores.profesorId, profesorId), eq(disponibilidadProfesores.planificacionSemestreId, planificacionSemestreId));
      await tx.delete(disponibilidadProfesores).where(condicion);
      if (bloquesIds.length) await tx.insert(disponibilidadProfesores).values(bloquesIds.map(bloqueId => ({ profesorId, planificacionSemestreId, bloqueId })));
      return tx.query.disponibilidadProfesores.findMany({ where: condicion, with: relacionesDisponibilidad });
    });
  },
  async delete(id: number) {
    return conPlanificacionesEditables(async tx => {
      const registro = await tx.query.disponibilidadProfesores.findFirst({ where: eq(disponibilidadProfesores.id, id) });
      if (!registro) throw new NotFoundError("Disponibilidad no encontrada");
      return [registro.planificacionSemestreId];
    }, async tx => !!(await tx.delete(disponibilidadProfesores).where(eq(disponibilidadProfesores.id, id)).returning()).length);
  },
  async deleteByProfesorAndPlanificacion(profesorId: number, planificacionSemestreId: number) {
    return conPlanificacionesEditables(async () => [planificacionSemestreId], async tx =>
      (await tx.delete(disponibilidadProfesores).where(and(eq(disponibilidadProfesores.profesorId, profesorId), eq(disponibilidadProfesores.planificacionSemestreId, planificacionSemestreId))).returning()).length);
  },
};
