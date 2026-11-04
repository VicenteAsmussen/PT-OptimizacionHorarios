import { ConflictError } from "./errors.js";

export function exigirInicioOptimizacion(planificacion: { actual: boolean; estadoPlanificacion: string }, horariosGestionados: number) {
  if (!planificacion.actual || planificacion.estadoPlanificacion !== "preparacion") {
    throw new ConflictError("Solo se puede optimizar una planificación actual en Preparación.");
  }
  if (horariosGestionados > 0) throw new ConflictError("Reinicie explícitamente los horarios gestionados y devuelva la planificación a Preparación antes de generar otro horario.");
}

export function resolverIdempotencia(previa: { claveIdempotencia: string; revisionSolicitud: string } | undefined, clave: string, revision: string) {
  if (!previa || previa.claveIdempotencia !== clave) return false;
  if (previa.revisionSolicitud !== revision) throw new ConflictError("La clave de idempotencia ya fue utilizada con otros parámetros.");
  return true;
}
