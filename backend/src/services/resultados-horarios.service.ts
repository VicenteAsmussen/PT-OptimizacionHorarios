import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { resultadosHorariosRepository } from "../repositories/resultados-horarios.repository.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import { horariosService } from "./horarios.service.js";
import { esGestionada, presentarResultado, prepararMovimiento, revisionResultado, validarPublicacionResultado,
  solicitaSala, type ContextoResultado, type MovimientoResultado } from "../utils/resultados-horarios.js";

// Oculta los resultados que pertenecen a otra carrera del alcance autorizado.
function exigirAcceso(contexto: ContextoResultado, alcance?: AlcanceCarrera) {
  if (alcance && contexto.planificacion.carreraId !== alcance.carreraId) throw new NotFoundError("Planificación no encontrada.");
}
// Exige una propuesta actual cuya revisión coincida con la consultada por el cliente.
function exigirPropuesta(contexto: ContextoResultado, revision: string, alcance?: AlcanceCarrera) {
  exigirAcceso(contexto, alcance);
  if (!contexto.planificacion.actual || contexto.planificacion.estadoPlanificacion !== "propuesta") throw new ConflictError("Solo se puede modificar una planificación actual en Propuesta.");
  if (revisionResultado(contexto) !== revision) throw new ConflictError("El horario o sus restricciones cambiaron. Vuelva a consultar antes de confirmar.");
}
export const resultadosHorariosService = {
  // Retira la propuesta gestionada y su ejecución sin eliminar la preparación ni los externos.
  async descartar(id: number, revision: string, alcance?: AlcanceCarrera) {
    return resultadosHorariosRepository.conBloqueo(id, async (contexto, persistencia) => {
      exigirPropuesta(contexto, revision, alcance);
      const gestionadas = contexto.entradas.filter(entrada => esGestionada(contexto, entrada));
      const ejecucionesIds = [...new Set(gestionadas.map(entrada => entrada.ejecucionOptimizacionId).filter((id): id is string => Boolean(id)))];
      if (contexto.entradas.some(entrada => !esGestionada(contexto, entrada) && entrada.ejecucionOptimizacionId && ejecucionesIds.includes(entrada.ejecucionOptimizacionId))) {
        throw new ConflictError("La ejecución también respalda horarios externos. No se puede descartar esta propuesta.");
      }
      await persistencia.descartar(gestionadas.map(entrada => entrada.id), ejecucionesIds);
      return { planificacion: { ...contexto.planificacion, estadoPlanificacion: "preparacion" as const } };
    });
  },
  // Prepara el intercambio de salas para las sesiones que requieren asignación física.
  async exportarSalas(id: number, soloPendientes: boolean, usuario: { id: number; rol: string }, alcance?: AlcanceCarrera) {
    const contexto = await resultadosHorariosRepository.leer(id);
    exigirAcceso(contexto, alcance);
    return horariosService.exportarExcelSalas(id, usuario, { planificacion: contexto.planificacion, carreraId: alcance?.carreraId,
      entradas: contexto.entradas.filter(entrada => solicitaSala(contexto, entrada)), soloPendientes });
  },
  // Incorpora salas sobre una propuesta vigente usando su contexto autorizado y bloqueado.
  async importarSalas(id: number, revision: string, archivo: Buffer, usuario: { id: number; rol: string }, alcance?: AlcanceCarrera) {
    return resultadosHorariosRepository.conBloqueo(id, async (contexto, persistencia) => {
      exigirPropuesta(contexto, revision, alcance);
      return horariosService.importarExcelSalas(id, archivo, usuario, { planificacion: contexto.planificacion, carreraId: alcance?.carreraId,
        contexto: { entradas: contexto.entradas.filter(entrada => solicitaSala(contexto, entrada)), entradasParaConflictos: contexto.entradas, salas: contexto.salas },
        guardar: cambios => persistencia.asignarSalas(cambios) });
    });
  },
  // Presenta las sesiones y restricciones del resultado dentro de la carrera autorizada.
  async consultar(id: number, alcance?: AlcanceCarrera, semestreMalla?: number) {
    const contexto = await resultadosHorariosRepository.leer(id);
    exigirAcceso(contexto, alcance);
    return presentarResultado(contexto, semestreMalla);
  },
  // Simula el movimiento de una sesión sin persistir cambios en el horario.
  async validarMovimiento(id: number, datos: MovimientoResultado, alcance?: AlcanceCarrera) {
    const contexto = await resultadosHorariosRepository.leer(id);
    exigirPropuesta(contexto, datos.revision, alcance);
    return prepararMovimiento(contexto, datos);
  },
  // Revalida y persiste un movimiento sobre la propuesta bloqueada antes de presentarla.
  async mover(id: number, datos: MovimientoResultado, alcance?: AlcanceCarrera) {
    return resultadosHorariosRepository.conBloqueo(id, async (contexto, persistencia) => {
      exigirPropuesta(contexto, datos.revision, alcance);
      const resultado = prepararMovimiento(contexto, datos);
      if (!resultado.valido) throw new ConflictError(resultado.problemas.map(problema => problema.mensaje).join(" "));
      await persistencia.mover(resultado.cambios);
      for (const cambio of resultado.cambios) {
        const entrada = contexto.entradas.find(fila => fila.id === cambio.id)!;
        entrada.bloqueId = cambio.bloqueId;
        entrada.bloque = contexto.bloques.find(bloque => bloque.id === cambio.bloqueId)!;
      }
      return presentarResultado(contexto);
    });
  },
  // Informa los impedimentos de publicación sin cambiar el estado del período.
  async validarPublicacion(id: number, alcance?: AlcanceCarrera) {
    const contexto = await resultadosHorariosRepository.leer(id);
    exigirAcceso(contexto, alcance);
    return validarPublicacionResultado(contexto);
  },
  // Publica únicamente la revisión vigente que supera los validadores del resultado.
  async publicar(id: number, revision: string, alcance?: AlcanceCarrera) {
    return resultadosHorariosRepository.conBloqueo(id, async (contexto, persistencia) => {
      exigirPropuesta(contexto, revision, alcance);
      const resultado = validarPublicacionResultado(contexto);
      if (!resultado.valido) throw new ConflictError(resultado.problemas.map(problema => problema.mensaje).join(" "));
      await persistencia.publicar();
      contexto.planificacion.estadoPlanificacion = "publicado";
      return presentarResultado(contexto);
    });
  },
};
