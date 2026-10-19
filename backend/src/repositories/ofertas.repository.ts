import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { ofertasAsignaturas, type NuevaOfertaAsignatura } from "../db/schema/ofertas-asignaturas.schema.js";
import { asignaturas } from "../db/schema/asignaturas.schema.js";
import { profesores, columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import { horariosAsignaturas } from "../db/schema/horarios-asignaturas.schema.js";
import { planificacionesSemestresRepository } from "./planificaciones-semestres.repository.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import { conPlanificacionesEditables, exigirVinculoEsperado, type TransaccionPlanificacion } from "./planificacion-escritura.js";

async function vinculoOferta(tx: TransaccionPlanificacion, id: number, origenEsperado?: number) {
  const oferta = await tx.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.id, id) });
  if (!oferta) throw new NotFoundError("Oferta no encontrada");
  exigirVinculoEsperado(oferta.planificacionSemestreId, origenEsperado);
  return oferta.planificacionSemestreId;
}

const relacionesOferta = {
  asignatura: { with: { tiposHora: { with: { tipoHora: true as const } } } },
  profesor: { columns: columnasProfesorSinRut, with: { departamento: true as const } },
  planificacionSemestre: true as const,
  horarios: { with: { sala: true as const, bloque: true as const, tipoHora: true as const } },
};
export const ofertasRepository = {
  async findAll(filtro?: { planificacionSemestreId?: number; profesorId?: number; asignaturaCodigo?: string }, alcance?: AlcanceCarrera) {
    return db.query.ofertasAsignaturas.findMany({
      where: and(
        alcance ? inArray(ofertasAsignaturas.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)) : undefined,
        filtro?.planificacionSemestreId ? eq(ofertasAsignaturas.planificacionSemestreId, filtro.planificacionSemestreId) : undefined,
        filtro?.profesorId ? eq(ofertasAsignaturas.profesorId, filtro.profesorId) : undefined,
        filtro?.asignaturaCodigo ? eq(ofertasAsignaturas.asignaturaCodigo, filtro.asignaturaCodigo) : undefined,
      ), with: relacionesOferta,
    });
  },
  async findById(id: number) {
    return db.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.id, id), with: relacionesOferta });
  },
  async findByUniqueConstraint(codigo: string, planificacionSemestreId: number, seccion: number) {
    return db.query.ofertasAsignaturas.findFirst({ where: and(eq(ofertasAsignaturas.asignaturaCodigo, codigo), eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId), eq(ofertasAsignaturas.seccion, seccion)) });
  },
  async checkAsignaturaExists(codigo: string) {
    return !!await db.query.asignaturas.findFirst({ where: eq(asignaturas.codigo, codigo) });
  },
  async checkProfesorExists(id: number) {
    return !!await db.query.profesores.findFirst({ where: eq(profesores.id, id), columns: { id: true } });
  },
  async create(datos: NuevaOfertaAsignatura) {
    return conPlanificacionesEditables(async () => [datos.planificacionSemestreId], async tx => {
      const [creada] = await tx.insert(ofertasAsignaturas).values(datos).returning();
      return creada;
    });
  },
  async update(id: number, datos: Partial<Omit<NuevaOfertaAsignatura, "id">>, origenEsperado?: number) {
    return conPlanificacionesEditables(async tx => {
      const origen = await vinculoOferta(tx, id, origenEsperado);
      return [origen, datos.planificacionSemestreId ?? origen];
    }, async tx => {
      const [actualizada] = await tx.update(ofertasAsignaturas).set(datos).where(eq(ofertasAsignaturas.id, id)).returning();
      return actualizada;
    });
  },
  async delete(id: number, origenEsperado?: number): Promise<boolean> {
    return conPlanificacionesEditables(async tx => [await vinculoOferta(tx, id, origenEsperado)], async tx => {
      // Conserva la exclusión con el KEY SHARE de nuevas entradas.
      const [oferta] = await tx.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas).where(eq(ofertasAsignaturas.id, id)).for("update");
      if (!oferta) return false;
      const [horario] = await tx.select({ id: horariosAsignaturas.id }).from(horariosAsignaturas).where(eq(horariosAsignaturas.ofertaId, id)).limit(1);
      if (horario) throw new ConflictError("No se puede eliminar una oferta con horarios asociados");
      const [eliminada] = await tx.delete(ofertasAsignaturas).where(eq(ofertasAsignaturas.id, id)).returning({ id: ofertasAsignaturas.id });
      return !!eliminada;
    });
  },
};
