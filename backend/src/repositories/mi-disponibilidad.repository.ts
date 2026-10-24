import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { planificacionesSemestres } from "../db/schema/planificaciones-semestres.schema.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { ofertaTipoHora } from "../db/schema/oferta-tipo-hora.schema.js";
import { disponibilidadProfesores } from "../db/schema/disponibilidad-profesores.schema.js";
import { bloquesHorarios } from "../db/schema/bloques-horarios.schema.js";
import { conPlanificacionesEditables, type TransaccionPlanificacion } from "./planificacion-escritura.js";
import { reemplazarDisponibilidad } from "./disponibilidad.repository.js";
import { ForbiddenError } from "../utils/errors.js";

async function contexto(profesorId: number, conexion: TransaccionPlanificacion | typeof db = db, incluirAnteriores = false) {
  const [planificaciones, ofertas, bloques, filas] = await Promise.all([
    conexion.query.planificacionesSemestres.findMany({ where: incluirAnteriores ? undefined : eq(planificacionesSemestres.actual, true), with: { carrera: true }, orderBy: [asc(planificacionesSemestres.id)] }),
    conexion.query.ofertasAsignaturas.findMany({
      where: inArray(ofertasAsignaturas.id, conexion.select({ id: ofertaTipoHora.ofertaId }).from(ofertaTipoHora).where(eq(ofertaTipoHora.profesorId, profesorId))),
      with: { asignatura: { with: { tiposHora: true } }, asignaciones: { where: eq(ofertaTipoHora.profesorId, profesorId), with: { tipoHora: true } } },
      orderBy: [asc(ofertasAsignaturas.id)],
    }),
    conexion.query.bloquesHorarios.findMany({ orderBy: [asc(bloquesHorarios.id)] }),
    conexion.query.disponibilidadProfesores.findMany({ where: eq(disponibilidadProfesores.profesorId, profesorId), orderBy: [asc(disponibilidadProfesores.bloqueId)] }),
  ]);
  const propias = ofertas.filter(oferta => oferta.asignaciones.some(asignacion => asignacion.profesorId === profesorId));
  return {
    planificaciones: planificaciones.filter(planificacion => (incluirAnteriores || planificacion.actual) && propias.some(oferta => oferta.planificacionSemestreId === planificacion.id)).map(planificacion => ({
      id: planificacion.id, codigo: planificacion.codigo, carreraNombre: planificacion.carrera.nombre,
      estadoPlanificacion: planificacion.estadoPlanificacion, actual: planificacion.actual,
    })),
    bloques,
    seleccion(planificacionSemestreId: number) {
      const planificacion = planificaciones.find(fila => fila.id === planificacionSemestreId && (incluirAnteriores || fila.actual));
      const asignadas = propias.filter(oferta => oferta.planificacionSemestreId === planificacionSemestreId);
      if (!planificacion || !asignadas.length) throw new ForbiddenError("No tiene asignaciones en esta planificación actual");
      const carga = asignadas.flatMap(oferta => oferta.asignaciones.filter(asignacion => asignacion.profesorId === profesorId).map(asignacion => ({
        ofertaId: oferta.id, asignaturaCodigo: oferta.asignaturaCodigo, asignaturaNombre: oferta.asignatura.nombre,
        seccion: oferta.seccion, tipoHoraId: asignacion.tipoHoraId, tipoHoraNombre: asignacion.tipoHora.tipo,
        horas: oferta.asignatura.tiposHora.find(tipo => tipo.tipoHoraId === asignacion.tipoHoraId)?.horas ?? 0,
      }))).sort((primero, segundo) => primero.ofertaId - segundo.ofertaId || primero.tipoHoraId - segundo.tipoHoraId);
      return { planificacionSemestreId, bloquesIds: filas.filter(fila => fila.profesorId === profesorId && fila.planificacionSemestreId === planificacionSemestreId).map(fila => fila.bloqueId).sort((a, b) => a - b),
        minimoBloques: carga.reduce((suma, fila) => suma + fila.horas, 0), carga,
        editable: planificacion.actual && planificacion.estadoPlanificacion === "preparacion" };
    },
  };
}
export type SeleccionDisponibilidad = ReturnType<Awaited<ReturnType<typeof contexto>>["seleccion"]>;
export const miDisponibilidadRepository = {
  contexto,
  async modificar(profesorId: number, planificacionSemestreId: number,
    preparar: (seleccion: SeleccionDisponibilidad, bloques: Awaited<ReturnType<typeof contexto>>["bloques"]) => number[]) {
    return conPlanificacionesEditables(async tx => {
      const actual = (await contexto(profesorId, tx)).seleccion(planificacionSemestreId);
      if (!actual.editable) throw new ForbiddenError("Solo se puede modificar disponibilidad en una planificación actual en preparación");
      return [planificacionSemestreId];
    }, async tx => {
      const actual = await contexto(profesorId, tx);
      const seleccion = actual.seleccion(planificacionSemestreId);
      const bloquesIds = preparar(seleccion, actual.bloques);
      const filas = await reemplazarDisponibilidad(tx, profesorId, planificacionSemestreId, bloquesIds);
      return { seleccion: { ...seleccion, bloquesIds }, filas };
    });
  },
};
