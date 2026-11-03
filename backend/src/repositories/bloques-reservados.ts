import { eq } from "drizzle-orm";
import { bloquesReservados } from "../db/schema/bloques-reservados.schema.js";
import { planificacionesSemestres } from "../db/schema/planificaciones-semestres.schema.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import { mensajeBloqueReservado } from "../utils/bloques-reservados.js";
import type { TransaccionPlanificacion } from "./planificacion-escritura.js";

export async function leerBloquesReservados(conexion: Pick<TransaccionPlanificacion, "query">, carreraId: number) {
  const reservas = await conexion.query.bloquesReservados.findMany({ where: eq(bloquesReservados.carreraId, carreraId) });
  return reservas.map(reserva => reserva.bloqueHorarioId);
}

/** Revalidar dentro de la transacción, antes de modificar cualquier fila del lote. */
export async function exigirBloquesNoReservados(tx: TransaccionPlanificacion, planificacionSemestreId: number, bloquesIds: number[]) {
  if (!bloquesIds.length) return;
  const planificacion = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, planificacionSemestreId) });
  if (!planificacion) throw new NotFoundError("Planificación no encontrada");
  const reservados = new Set(await leerBloquesReservados(tx, planificacion.carreraId));
  if (bloquesIds.some(id => reservados.has(id))) throw new ConflictError(mensajeBloqueReservado);
}
