import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { carreras, planificacionesSemestres, carreraDepartamento, asignaturas, ofertasAsignaturas,
  ofertaTipoHora, horariosAsignaturas } from "../db/schema/index.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import type { TransaccionPlanificacion } from "./planificacion-escritura.js";
import type { AlcanceReinicio, ReiniciarPeriodoDTO, EstadoPeriodoDTO } from "../validations/administracion-periodos.validation.js";

// Maintenance is an explicit admin command, not an exception in ordinary write guards.
// Keep the same career -> planning lock order as conPlanificacionesEditables.
async function conPeriodoBloqueado<T>(id: number, ejecutar: (tx: TransaccionPlanificacion,
  planificacion: typeof planificacionesSemestres.$inferSelect, carrera: typeof carreras.$inferSelect) => Promise<T>) {
  return db.transaction(async tx => {
    const inicial = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id) });
    if (!inicial) throw new NotFoundError("Planificación no encontrada");
    const [carrera] = await tx.select().from(carreras).where(eq(carreras.id, inicial.carreraId)).for("update");
    const [planificacion] = await tx.select().from(planificacionesSemestres).where(eq(planificacionesSemestres.id, id)).for("update");
    if (!carrera || !planificacion || planificacion.carreraId !== inicial.carreraId) {
      throw new ConflictError("La planificación cambió; vuelve a consultar el período");
    }
    return ejecutar(tx, planificacion, carrera);
  }, { isolationLevel: "read committed" });
}

async function capturar(tx: TransaccionPlanificacion, planificacion: typeof planificacionesSemestres.$inferSelect,
  carrera: typeof carreras.$inferSelect, alcance: AlcanceReinicio) {
  const relaciones = await tx.select().from(carreraDepartamento)
    .where(eq(carreraDepartamento.carreraId, carrera.id)).orderBy(carreraDepartamento.departamentoId).for("share");
  const ofertasPeriodo = await tx.select().from(ofertasAsignaturas)
    .where(eq(ofertasAsignaturas.planificacionSemestreId, planificacion.id)).orderBy(ofertasAsignaturas.id).for("update");
  const codigos = [...new Set(ofertasPeriodo.map(oferta => oferta.asignaturaCodigo))].sort();
  const materias = codigos.length ? await tx.select().from(asignaturas)
    .where(inArray(asignaturas.codigo, codigos)).orderBy(asignaturas.codigo).for("share") : [];
  const departamentosGestionados = new Set(relaciones.filter(relacion => relacion.esGestionado).map(relacion => relacion.departamentoId));
  const codigosGestionados = new Set(materias.filter(materia => departamentosGestionados.has(materia.departamentoId)).map(materia => materia.codigo));
  const departamentosExternos = new Set(relaciones.filter(relacion => !relacion.esGestionado).map(relacion => relacion.departamentoId));
  const codigosExternos = new Set(materias.filter(materia => departamentosExternos.has(materia.departamentoId)).map(materia => materia.codigo));
  const ofertas = ofertasPeriodo.filter(oferta => alcance === "todas"
    || (alcance === "gestionadas" ? codigosGestionados : codigosExternos).has(oferta.asignaturaCodigo));
  const ids = ofertas.map(oferta => oferta.id);
  const asignaciones = ids.length ? await tx.select().from(ofertaTipoHora).where(inArray(ofertaTipoHora.ofertaId, ids))
    .orderBy(ofertaTipoHora.ofertaId, ofertaTipoHora.tipoHoraId).for("update") : [];
  const horarios = ids.length ? await tx.select().from(horariosAsignaturas)
    .where(and(eq(horariosAsignaturas.planificacionSemestreId, planificacion.id), inArray(horariosAsignaturas.ofertaId, ids)))
    .orderBy(horariosAsignaturas.id).for("update") : [];
  const huella = createHash("sha256").update(JSON.stringify({ planificacion, carrera, alcance, relaciones, materias, ofertas, asignaciones, horarios })).digest("hex");
  const resumen = { planificacion: { ...planificacion, carrera }, alcance, ofertas: ofertas.length,
    asignaciones: asignaciones.length, horarios: horarios.length, huella };
  return { resumen, ids };
}

export const administracionPeriodosRepository = {
  resumen(id: number, alcance: AlcanceReinicio) {
    return conPeriodoBloqueado(id, async (tx, planificacion, carrera) => {
      const captura = await capturar(tx, planificacion, carrera, alcance);
      return captura.resumen;
    });
  },
  reiniciar(id: number, datos: ReiniciarPeriodoDTO) {
    return conPeriodoBloqueado(id, async (tx, planificacion, carrera) => {
      const { resumen, ids } = await capturar(tx, planificacion, carrera, datos.alcance);
      if (datos.confirmacion !== planificacion.codigo || datos.huella !== resumen.huella) {
        throw new ConflictError("Los datos cambiaron o la confirmación no coincide. Consulta y confirma nuevamente el resumen");
      }
      if (datos.objetivo === "ofertas" && resumen.horarios > 0) {
        throw new ConflictError("Reinicia primero los horarios de este alcance antes de reiniciar sus ofertas");
      }
      if (ids.length) {
        if (datos.objetivo === "horarios") {
          await tx.delete(horariosAsignaturas).where(and(eq(horariosAsignaturas.planificacionSemestreId, id), inArray(horariosAsignaturas.ofertaId, ids)));
        } else {
          await tx.delete(ofertaTipoHora).where(inArray(ofertaTipoHora.ofertaId, ids));
          await tx.delete(ofertasAsignaturas).where(and(eq(ofertasAsignaturas.planificacionSemestreId, id), inArray(ofertasAsignaturas.id, ids)));
        }
      }
      return { ofertas: datos.objetivo === "ofertas" ? resumen.ofertas : 0,
        asignaciones: datos.objetivo === "ofertas" ? resumen.asignaciones : 0, horarios: resumen.horarios };
    });
  },
  cambiarEstado(id: number, datos: EstadoPeriodoDTO) {
    return conPeriodoBloqueado(id, async (tx, planificacion, carrera) => {
      if (planificacion.estadoPlanificacion !== datos.estadoAnterior) {
        throw new ConflictError("El estado cambió. Consulta nuevamente el período antes de continuar");
      }
      if (datos.estadoPlanificacion !== planificacion.estadoPlanificacion) {
        const { resumen } = await capturar(tx, planificacion, carrera, "gestionadas");
        if (datos.estadoPlanificacion === "preparacion" && resumen.horarios > 0) {
          throw new ConflictError("Para volver a Preparación, elimina primero los horarios gestionados de este período");
        }
        if (datos.estadoPlanificacion !== "preparacion" && resumen.horarios === 0) {
          throw new ConflictError("Para pasar a Propuesta o Publicado, el período debe tener horarios de asignaturas gestionadas");
        }
      }
      const [actualizada] = await tx.update(planificacionesSemestres).set({ estadoPlanificacion: datos.estadoPlanificacion })
        .where(eq(planificacionesSemestres.id, id)).returning();
      return actualizada;
    });
  },
};
