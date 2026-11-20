import { and, eq, inArray, sql } from "drizzle-orm";
import { ejecucionesOptimizacion } from "../db/schema/ejecuciones-optimizacion.schema.js";
import { planificacionesSemestres } from "../db/schema/planificaciones-semestres.schema.js";
import { ConflictError } from "../utils/errors.js";
import type { TransaccionPlanificacion } from "./planificacion-escritura.js";

// El arrendamiento permite recuperar una caída sin atribuir a otra instancia sus ejecuciones.
// Al vencer, el proceso anterior ya no puede aplicar resultados, aunque Julia siga ejecutándose.
// Registra como interrumpidos los intentos activos cuyo arrendamiento ya venció.
export async function recuperarEjecucionesVencidas(tx: Pick<TransaccionPlanificacion, "update">) {
  return tx.update(ejecucionesOptimizacion).set({ estado: "interrumpida", finalizadaEn: new Date(),
    diagnostico: { codigo: "interrupcion", mensaje: "La ejecución perdió el seguimiento del backend. No se incorporaron resultados parciales ni se reintentó el cálculo." } })
    .where(and(eq(ejecucionesOptimizacion.estado, "en_ejecucion"), sql`${ejecucionesOptimizacion.vigenteHasta} <= now()`));
}

// Impide cambios de preparación o resultado mientras haya un intento registrado como activo.
export async function exigirSinEjecucionActiva(tx: Pick<TransaccionPlanificacion, "select">, ids: number[]) {
  if (!ids.length) return;
  // Incluso una ejecución con arrendamiento vencido se recupera antes de admitir nuevas escrituras.
  const [activa] = await tx.select({ id: ejecucionesOptimizacion.id }).from(ejecucionesOptimizacion)
    .where(and(inArray(ejecucionesOptimizacion.planificacionSemestreId, ids), eq(ejecucionesOptimizacion.estado, "en_ejecucion"))).limit(1);
  if (activa) throw new ConflictError("Hay una ejecución del modelo activa. Espere su término antes de modificar esta planificación.");
}

// Extiende el bloqueo por cálculo activo a todos los períodos de la carrera mantenida.
export async function exigirCarreraSinEjecucion(tx: Pick<TransaccionPlanificacion, "select">, carreraId: number) {
  const periodos = await tx.select({ id: planificacionesSemestres.id }).from(planificacionesSemestres).where(eq(planificacionesSemestres.carreraId, carreraId));
  await exigirSinEjecucionActiva(tx, periodos.map(periodo => periodo.id));
}
