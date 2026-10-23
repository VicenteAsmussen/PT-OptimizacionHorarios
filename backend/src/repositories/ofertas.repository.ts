import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray, ne } from "drizzle-orm";
import { db } from "../config/db.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { asignaturas } from "../db/schema/asignaturas.schema.js";
import { profesores, columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import { horariosAsignaturas } from "../db/schema/horarios-asignaturas.schema.js";
import { ofertaTipoHora } from "../db/schema/oferta-tipo-hora.schema.js";
import { asignaturaTipoHora } from "../db/schema/asignatura-tipo-hora.schema.js";
import type { CreateOfertaDTO, UpdateOfertaDTO } from "../validations/ofertas.validation.js";
import { planificacionesSemestresRepository } from "./planificaciones-semestres.repository.js";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors.js";
import { conPlanificacionesEditables, exigirVinculoEsperado, type TransaccionPlanificacion } from "./planificacion-escritura.js";

async function vinculoOferta(tx: TransaccionPlanificacion, id: number, origenEsperado?: number) {
  const oferta = await tx.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.id, id) });
  if (!oferta) throw new NotFoundError("Oferta no encontrada");
  exigirVinculoEsperado(oferta.planificacionSemestreId, origenEsperado);
  return oferta.planificacionSemestreId;
}

const relacionesOferta = {
  asignatura: { with: { tiposHora: { with: { tipoHora: true as const } } } },
  asignaciones: { with: { tipoHora: true as const, profesor: { columns: columnasProfesorSinRut, with: { departamento: true as const } } } },
  planificacionSemestre: true as const,
  horarios: { with: { sala: true as const, bloque: true as const, tipoHora: true as const } },
};

async function guardarAsignaciones(tx: TransaccionPlanificacion, oferta: typeof ofertasAsignaturas.$inferSelect,
  asignaciones: CreateOfertaDTO["asignaciones"]) {
  const tipos = await tx.query.asignaturaTipoHora.findMany({ where: eq(asignaturaTipoHora.asignaturaCodigo, oferta.asignaturaCodigo) });
  if (new Set(asignaciones.map(a => a.tipoHoraId)).size !== asignaciones.length
    || asignaciones.some(a => !tipos.some(t => t.tipoHoraId === a.tipoHoraId))) {
    throw new BadRequestError("Las asignaciones deben tener tipos de hora únicos definidos para la asignatura");
  }
  const horarios = await tx.query.horariosAsignaturas.findMany({ where: eq(horariosAsignaturas.ofertaId, oferta.id) });
  if (horarios.some(h => !asignaciones.some(a => a.tipoHoraId === h.tipoHoraId))) {
    throw new ConflictError("No se puede quitar un profesor de un tipo de hora con horarios asociados");
  }
  for (const asignacion of asignaciones) {
    for (const horario of horarios.filter(h => h.tipoHoraId === asignacion.tipoHoraId)) {
      const [conflicto] = await tx.select({ id: horariosAsignaturas.id }).from(horariosAsignaturas)
        .innerJoin(ofertaTipoHora, and(eq(ofertaTipoHora.ofertaId, horariosAsignaturas.ofertaId), eq(ofertaTipoHora.tipoHoraId, horariosAsignaturas.tipoHoraId)))
        .where(and(eq(ofertaTipoHora.profesorId, asignacion.profesorId), eq(horariosAsignaturas.planificacionSemestreId, oferta.planificacionSemestreId),
          eq(horariosAsignaturas.bloqueId, horario.bloqueId), ne(horariosAsignaturas.id, horario.id))).limit(1);
      if (conflicto) throw new ConflictError("Conflicto de horario: profesor ocupado en esta planificación");
    }
  }
  const anteriores = await tx.query.ofertaTipoHora.findMany({ where: eq(ofertaTipoHora.ofertaId, oferta.id) });
  for (const anterior of anteriores) {
    if (!asignaciones.some(a => a.tipoHoraId === anterior.tipoHoraId)) {
      await tx.delete(ofertaTipoHora).where(and(eq(ofertaTipoHora.ofertaId, oferta.id), eq(ofertaTipoHora.tipoHoraId, anterior.tipoHoraId)));
    }
  }
  for (const asignacion of asignaciones) await tx.insert(ofertaTipoHora).values({ ofertaId: oferta.id, ...asignacion })
    .onConflictDoUpdate({ target: [ofertaTipoHora.ofertaId, ofertaTipoHora.tipoHoraId], set: { profesorId: asignacion.profesorId } });
}
export const ofertasRepository = {
  async findAll(filtro?: { planificacionSemestreId?: number; profesorId?: number; asignaturaCodigo?: string }, alcance?: AlcanceCarrera) {
    return db.query.ofertasAsignaturas.findMany({
      where: and(
        alcance ? inArray(ofertasAsignaturas.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)) : undefined,
        filtro?.planificacionSemestreId ? eq(ofertasAsignaturas.planificacionSemestreId, filtro.planificacionSemestreId) : undefined,
        filtro?.profesorId ? inArray(ofertasAsignaturas.id, db.select({ id: ofertaTipoHora.ofertaId }).from(ofertaTipoHora).where(eq(ofertaTipoHora.profesorId, filtro.profesorId))) : undefined,
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
  async findTiposAsignatura(codigo: string) {
    return db.query.asignaturaTipoHora.findMany({ where: eq(asignaturaTipoHora.asignaturaCodigo, codigo) });
  },
  async create(datos: CreateOfertaDTO) {
    return conPlanificacionesEditables(async () => [datos.planificacionSemestreId], async tx => {
      const { asignaciones, ...oferta } = datos;
      const [creada] = await tx.insert(ofertasAsignaturas).values(oferta).returning();
      await guardarAsignaciones(tx, creada, asignaciones ?? []);
      return creada;
    });
  },
  async update(id: number, datos: UpdateOfertaDTO, origenEsperado?: number) {
    return conPlanificacionesEditables(async tx => {
      const origen = await vinculoOferta(tx, id, origenEsperado);
      return [origen, datos.planificacionSemestreId ?? origen];
    }, async tx => {
      const { asignaciones, ...oferta } = datos;
      const actualizada = Object.keys(oferta).length
        ? (await tx.update(ofertasAsignaturas).set(oferta).where(eq(ofertasAsignaturas.id, id)).returning())[0]
        : (await tx.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.id, id) }))!;
      const anteriores = asignaciones ?? (await tx.query.ofertaTipoHora.findMany({ where: eq(ofertaTipoHora.ofertaId, id) }));
      await guardarAsignaciones(tx, actualizada, anteriores);
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
