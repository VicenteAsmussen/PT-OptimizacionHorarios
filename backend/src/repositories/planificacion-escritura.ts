import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { carreras } from "../db/schema/carreras.schema.js";
import { planificacionesSemestres, type PlanificacionSemestre } from "../db/schema/planificaciones-semestres.schema.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

export type TransaccionPlanificacion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function exigirVinculoEsperado(actual: number, esperado?: number) {
  if (esperado !== undefined && actual !== esperado) throw new ConflictError("El vínculo de planificación cambió; vuelva a intentar");
}

export function exigirPlanificacionEditable(planificacion: Pick<PlanificacionSemestre, "actual" | "estadoPlanificacion">) {
  if (!planificacion.actual || planificacion.estadoPlanificacion !== "preparacion") {
    throw new ConflictError("Solo se puede modificar una planificación actual en preparación");
  }
}

// Se descubren los dueños antes de bloquear, pero nunca se escribe confiando en esa lectura.
// Un cambio de vínculo aborta: adquirir nuevos bloqueos aquí rompería el orden global.
export async function conPlanificacionesEditables<T>(
  resolver: (tx: TransaccionPlanificacion) => Promise<number[]>,
  escribir: (tx: TransaccionPlanificacion) => Promise<T>,
): Promise<T> {
  return db.transaction(async tx => {
    const vinculos = await resolver(tx);
    const ids = [...new Set(vinculos)].sort((primero, segundo) => primero - segundo);
    const iniciales: PlanificacionSemestre[] = [];
    for (const id of ids) {
      const planificacion = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id) });
      if (!planificacion) throw new NotFoundError("Planificación no encontrada");
      iniciales.push(planificacion);
    }
    const carrerasIds = [...new Set(iniciales.map(fila => fila.carreraId))].sort((primero, segundo) => primero - segundo);
    for (const id of carrerasIds) await tx.select({ id: carreras.id }).from(carreras).where(eq(carreras.id, id)).for("update");
    for (const inicial of iniciales) {
      const [planificacion] = await tx.select().from(planificacionesSemestres).where(eq(planificacionesSemestres.id, inicial.id)).for("update");
      if (!planificacion || planificacion.carreraId !== inicial.carreraId) throw new ConflictError("La planificación cambió; vuelva a intentar");
      exigirPlanificacionEditable(planificacion);
    }
    const actuales = await resolver(tx);
    if (vinculos.length !== actuales.length || vinculos.some((id, indice) => id !== actuales[indice])) {
      throw new ConflictError("El vínculo de planificación cambió; vuelva a intentar");
    }
    return escribir(tx);
  }, { isolationLevel: "read committed" });
}
