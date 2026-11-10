import { createHash } from "node:crypto";
import type { horariosRepository } from "../repositories/horarios.repository.js";
import type { BloqueHorario } from "../db/schema/bloques-horarios.schema.js";
import type { PlanificacionSemestre } from "../db/schema/planificaciones-semestres.schema.js";
import { agruparBloquesEnSesiones, normalizarDia } from "./excel/excel-salas.js";
import { normalizarTipoHoraExcel } from "./excel/excel-comun.js";
import { BadRequestError } from "./errors.js";
import { mensajeBloqueReservado } from "./bloques-reservados.js";
import { comprobarCompatibilidadAcademica } from "./compatibilidad-academica.js";

export type EntradaResultado = Awaited<ReturnType<typeof horariosRepository.findParaExportarSalas>>[number];
export type AsignaturaResultado = EntradaResultado["oferta"]["asignatura"];
/** Presupuesto inmutable de la ejecución, independiente del catálogo físico de salas. */
export interface RecursosOptimizacionResultado {
  categorias: { id: string | number; edificio: string; tipo: string; capacidad: number; cantidad: number; fuente: string }[];
  // Asignación original del solver. Tras movimientos se comprueba una reasignación factible por bloque.
  asignaciones: { ofertaId: number; tipoHoraId: number; bloqueId: number; categoriaId: string | number }[];
}
export interface ContextoResultado {
  planificacion: PlanificacionSemestre;
  entradas: EntradaResultado[];
  ofertas: (Omit<EntradaResultado["oferta"], "asignatura"> & { asignatura: AsignaturaResultado })[];
  asignaturasMalla: AsignaturaResultado[];
  bloques: BloqueHorario[];
  salas: { id: number; nombre: string; tipo: string; capacidad?: number }[];
  disponibilidades: { profesorId: number; bloqueId: number; planificacionSemestreId: number }[];
  departamentosGestionadosIds: number[];
  bloquesReservadosIds: number[];
  recursosOptimizacion?: RecursosOptimizacionResultado;
}
export interface ProblemaResultado { codigo: string; mensaje: string; idsHorarios?: number[]; bloqueId?: number; ofertaId?: number }
export interface MovimientoResultado { revision: string; idsHorarios: number[]; bloqueInicioId: number }

// El orden de las consultas no debe producir revisiones obsoletas falsas.
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico).sort((primero, segundo) => JSON.stringify(primero).localeCompare(JSON.stringify(segundo)));
  if (valor !== null && typeof valor === "object") return Object.fromEntries(Object.entries(valor).sort(([primero], [segundo]) => primero.localeCompare(segundo)).map(([clave, contenido]) => [clave, canonico(contenido)]));
  return valor;
}
export function revisionResultado(contexto: ContextoResultado) {
  return createHash("sha256").update(JSON.stringify(canonico(contexto))).digest("hex");
}
export function esGestionada(contexto: ContextoResultado, entrada: EntradaResultado) {
  return contexto.departamentosGestionadosIds.includes(entrada.oferta.asignatura.departamentoId);
}
export function esLaboratorio(entrada: EntradaResultado) {
  return ["laboratorio", "laboratory"].includes(normalizarTipoHoraExcel(entrada.tipoHora.tipo));
}
export function solicitaSala(contexto: ContextoResultado, entrada: EntradaResultado) {
  return esGestionada(contexto, entrada) && entrada.oferta.asignatura.requiereSala && !esLaboratorio(entrada);
}
export function agruparEntradasResultado(entradas: EntradaResultado[]) {
  const grupos = new Map<string, EntradaResultado[]>();
  for (const entrada of entradas) {
    const clave = `${entrada.ofertaId}:${entrada.tipoHoraId}:${entrada.asignacion.profesorId}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), entrada]);
  }
  const sesiones: { entradas: EntradaResultado[]; dia: string; horaInicio: string; horaTermino: string }[] = [];
  for (const grupo of grupos.values()) {
    const resultado = agruparBloquesEnSesiones(grupo.map(entrada => entrada.bloque));
    if (!resultado.exito) throw new BadRequestError(resultado.error);
    for (const sesion of resultado.valor) sesiones.push({ dia: sesion.dia, horaInicio: sesion.horaInicio, horaTermino: sesion.horaTermino,
      entradas: grupo.filter(entrada => {
        const dia = normalizarDia(entrada.bloque.dia);
        return dia.exito && dia.valor === sesion.dia && sesion.numerosBloque.includes(entrada.bloque.numeroBloque);
      }).sort((primera, segunda) => primera.bloque.numeroBloque - segunda.bloque.numeroBloque) });
  }
  return sesiones.sort((primera, segunda) => primera.entradas[0]!.id - segunda.entradas[0]!.id);
}
export function presentarResultado(contexto: ContextoResultado, semestreMalla?: number) {
  const sesiones = agruparEntradasResultado(contexto.entradas).map(sesion => {
    const entrada = sesion.entradas[0]!;
    const estadoSala = esLaboratorio(entrada) ? "laboratorio" : !esGestionada(contexto, entrada) ? "externa"
      : !entrada.oferta.asignatura.requiereSala ? "noRequiere" : sesion.entradas.every(fila => fila.salaId !== null) ? "asignada" : "pendiente";
    return { idsHorarios: sesion.entradas.map(fila => fila.id), bloquesIds: sesion.entradas.map(fila => fila.bloqueId),
      ofertaId: entrada.ofertaId, asignatura: entrada.oferta.asignatura, seccion: entrada.oferta.seccion,
      profesor: entrada.asignacion.profesor, profesorId: entrada.asignacion.profesorId, tipoHora: entrada.tipoHora,
      dia: sesion.dia, horaInicio: sesion.horaInicio, horaTermino: sesion.horaTermino,
      salas: sesion.entradas.map(fila => {
        const sala = fila.salaId === null ? undefined : contexto.salas.find(sala => sala.id === fila.salaId);
        return sala ? { id: sala.id, nombre: sala.nombre } : null;
      }),
      estadoSala, editable: contexto.planificacion.actual && contexto.planificacion.estadoPlanificacion === "propuesta" && esGestionada(contexto, entrada) };
  });
  return { planificacion: contexto.planificacion, revision: revisionResultado(contexto), bloques: contexto.bloques,
    bloquesReservadosIds: contexto.bloquesReservadosIds,
    disponibilidades: contexto.disponibilidades, pendientesSala: sesiones.filter(sesion => sesion.estadoSala === "pendiente").length,
    sesiones: semestreMalla === undefined ? sesiones : sesiones.filter(sesion => sesion.asignatura.semestreMalla === semestreMalla) };
}
function conflictos(entradas: EntradaResultado[], cambiadas?: Set<number>) {
  const problemas: ProblemaResultado[] = [];
  const ocupaciones = new Map<number, EntradaResultado[]>();
  for (const entrada of entradas) ocupaciones.set(entrada.bloqueId, [...(ocupaciones.get(entrada.bloqueId) ?? []), entrada]);
  for (const [bloqueId, grupo] of ocupaciones) for (let indice = 0; indice < grupo.length; indice++) for (const segunda of grupo.slice(indice + 1)) {
    const primera = grupo[indice]!;
    if (cambiadas && !cambiadas.has(primera.id) && !cambiadas.has(segunda.id)) continue;
    const idsHorarios = [primera.id, segunda.id];
    if (primera.asignacion.profesorId === segunda.asignacion.profesorId) problemas.push({ codigo: "profesor", mensaje: "El profesor tiene otra clase en este bloque.", idsHorarios, bloqueId });
    if (primera.ofertaId === segunda.ofertaId) problemas.push({ codigo: "seccion", mensaje: "Los componentes de una misma sección no pueden ser simultáneos.", idsHorarios, bloqueId });
    if (primera.salaId !== null && primera.salaId === segunda.salaId) problemas.push({ codigo: "salaOcupada", mensaje: "La sala está ocupada en este bloque.", idsHorarios, bloqueId });
  }
  return problemas;
}
function comprobarDisponibilidad(contexto: ContextoResultado, entradas: EntradaResultado[]) {
  const disponibles = new Set(contexto.disponibilidades.filter(fila => fila.planificacionSemestreId === contexto.planificacion.id).map(fila => `${fila.profesorId}:${fila.bloqueId}`));
  return entradas.filter(entrada => esGestionada(contexto, entrada) && !disponibles.has(`${entrada.asignacion.profesorId}:${entrada.bloqueId}`))
    .map(entrada => ({ codigo: "disponibilidad", mensaje: "El profesor no tiene disponibilidad declarada en este bloque.", idsHorarios: [entrada.id], bloqueId: entrada.bloqueId }));
}
/** El inventario sólo existe si llegó desde la ejecución, nunca se deduce de salaId. */
export function comprobarRecursosResultado(contexto: ContextoResultado): ProblemaResultado[] {
  if (!contexto.recursosOptimizacion) return [];
  const categorias = contexto.recursosOptimizacion.categorias;
  if (new Set(categorias.map(categoria => categoria.id)).size !== categorias.length
    || categorias.some(categoria => !Number.isInteger(categoria.cantidad) || categoria.cantidad < 0
      || !Number.isFinite(categoria.capacidad) || categoria.capacidad <= 0 || !categoria.edificio || !categoria.fuente)) {
    return [{ codigo: "recursos", mensaje: "El presupuesto de recursos de la ejecución no es válido." }];
  }
  const ocupaciones = new Map<number, EntradaResultado[]>();
  for (const entrada of contexto.entradas.filter(entrada => esGestionada(contexto, entrada))) {
    ocupaciones.set(entrada.bloqueId, [...(ocupaciones.get(entrada.bloqueId) ?? []), entrada]);
  }
  const problemas: ProblemaResultado[] = [];
  const gestionadas = contexto.entradas.filter(entrada => esGestionada(contexto, entrada));
  if (gestionadas.some(entrada => entrada.ejecucionOptimizacionId)) {
    const usos = new Map<string, number>();
    for (const entrada of gestionadas) {
      const categoria = categorias.find(categoria => categoria.id === entrada.categoriaOptimizacionId);
      if (!categoria || categoria.capacidad < entrada.oferta.cupos
        || (normalizarTipoHoraExcel(categoria.tipo) === "laboratorio") !== esLaboratorio(entrada)) {
        problemas.push({ codigo: "recursos", mensaje: "La categoría de la ejecución no admite esta clase.", idsHorarios: [entrada.id] });
        continue;
      }
      const clave = JSON.stringify([entrada.bloqueId, categoria.id]);
      const cantidad = (usos.get(clave) ?? 0) + 1; usos.set(clave, cantidad);
      if (cantidad > categoria.cantidad) problemas.push({ codigo: "recursos", mensaje: "El movimiento excede la cantidad de la categoría de la ejecución.", bloqueId: entrada.bloqueId, idsHorarios: [entrada.id] });
      const siguiente = gestionadas.find(otra => otra.ofertaId === entrada.ofertaId && otra.tipoHoraId === entrada.tipoHoraId
        && otra.bloque.dia === entrada.bloque.dia && otra.bloque.numeroBloque === entrada.bloque.numeroBloque + 1);
      if (siguiente && siguiente.categoriaOptimizacionId !== entrada.categoriaOptimizacionId) problemas.push({ codigo: "recursos", mensaje: "Una sesión continua debe mantener su categoría de recurso.", idsHorarios: [entrada.id, siguiente.id] });
    }
    return problemas;
  }
  for (const [bloqueId, entradas] of ocupaciones) {
    const restantes = categorias.map(categoria => categoria.cantidad);
    // Al atender primero los mayores cupos, la elección de la menor capacidad suficiente
    // conserva todas las reasignaciones factibles dentro de cada tipo de recurso.
    for (const entrada of [...entradas].sort((a, b) => b.oferta.cupos - a.oferta.cupos)) {
      const candidatas = categorias.map((categoria, indice) => ({ categoria, indice }))
        .filter(({ categoria, indice }) => restantes[indice]! > 0 && categoria.capacidad >= entrada.oferta.cupos
          && normalizarTipoHoraExcel(categoria.tipo).includes("laboratorio") === esLaboratorio(entrada))
        .sort((a, b) => a.categoria.capacidad - b.categoria.capacidad);
      const elegida = candidatas[0];
      if (elegida) restantes[elegida.indice] = restantes[elegida.indice]! - 1;
      else problemas.push({ codigo: "recursos", mensaje: "El bloque excede la cantidad o capacidad de los recursos de la ejecución.", bloqueId, ofertaId: entrada.ofertaId, idsHorarios: [entrada.id] });
    }
  }
  return problemas;
}
function comprobarContinuidad(contexto: ContextoResultado, entradas: EntradaResultado[], cambiadas?: Set<number>): ProblemaResultado[] {
  try {
    const gestionadas = entradas.filter(entrada => esGestionada(contexto, entrada));
    const problemas = agruparEntradasResultado(gestionadas)
      .filter(sesion => (!cambiadas || sesion.entradas.some(entrada => cambiadas.has(entrada.id)))
        && (sesion.entradas.length < 2 || sesion.entradas.length > 4 || sesion.entradas[0]!.bloque.numeroBloque % 2 === 0))
      .map(sesion => ({ codigo: "continuidad", mensaje: "Cada sesión gestionada debe comenzar en un bloque impar y tener entre dos y cuatro bloques continuos.", idsHorarios: sesion.entradas.map(entrada => entrada.id) }));
    for (const entrada of gestionadas) {
      const continuas = gestionadas.filter(otra => otra.ofertaId === entrada.ofertaId && otra.bloque.dia === entrada.bloque.dia
        && otra.bloque.numeroBloque >= entrada.bloque.numeroBloque && otra.bloque.numeroBloque < entrada.bloque.numeroBloque + 5);
      if (new Set(continuas.map(otra => otra.bloque.numeroBloque)).size === 5 && (!cambiadas || continuas.some(otra => cambiadas.has(otra.id)))) {
        if (problemas.some(problema => continuas.every(otra => problema.idsHorarios.includes(otra.id)))) continue;
        problemas.push({ codigo: "continuidad", mensaje: "Una sección no puede tener más de cuatro bloques continuos sumando T/P/L.", idsHorarios: continuas.map(otra => otra.id) });
      }
    }
    return problemas;
  } catch (error) {
    if (!(error instanceof BadRequestError)) throw error;
    return [{ codigo: "continuidad", mensaje: error.message }];
  }
}
export function prepararMovimiento(contexto: ContextoResultado, datos: MovimientoResultado) {
  const problemas: ProblemaResultado[] = [];
  const rechazar = (codigo: string, mensaje: string) => ({ valido: false, problemas: [{ codigo, mensaje }], cambios: [] as { id: number; bloqueId: number }[] });
  const seleccionadas = contexto.entradas.filter(entrada => datos.idsHorarios.includes(entrada.id));
  if (seleccionadas.length !== datos.idsHorarios.length || seleccionadas.length < 2) return rechazar("seleccion", "Seleccione al menos dos bloques existentes de una sesión.");
  if (seleccionadas.some(entrada => !esGestionada(contexto, entrada))) return rechazar("externa", "Los horarios externos son fijos y no se pueden mover.");
  const sesion = agruparEntradasResultado(contexto.entradas).find(grupo => seleccionadas.every(entrada => grupo.entradas.some(fila => fila.id === entrada.id)));
  if (!sesion || agruparEntradasResultado(seleccionadas).length !== 1) return rechazar("continuidad", "Los bloques seleccionados deben ser consecutivos y pertenecer a una sola sesión.");
  const restantes = sesion.entradas.filter(entrada => !datos.idsHorarios.includes(entrada.id));
  const segmentosRestantes = agruparEntradasResultado(restantes);
  if (segmentosRestantes.some(grupo => grupo.entradas.length < 2)) return rechazar("bloqueAislado", "El movimiento dejaría un bloque aislado en el horario original.");
  if (segmentosRestantes.some(grupo => grupo.entradas[0]!.bloque.numeroBloque % 2 === 0)) return rechazar("restantePar", "Los segmentos restantes deben comenzar en un bloque institucional impar.");
  if (segmentosRestantes.some(grupo => grupo.entradas.length > 4)) return rechazar("continuidad", "El movimiento dejaría una sesión de más de cuatro bloques continuos en el horario original.");
  const inicio = contexto.bloques.find(bloque => bloque.id === datos.bloqueInicioId);
  if (!inicio) return rechazar("destino", "El bloque de inicio no existe.");
  if (inicio.numeroBloque % 2 === 0) return rechazar("inicioPar", "La clase debe comenzar en un bloque institucional impar.");
  const destinos = contexto.bloques.filter(bloque => bloque.dia === inicio.dia && bloque.numeroBloque >= inicio.numeroBloque && bloque.numeroBloque < inicio.numeroBloque + seleccionadas.length)
    .sort((primero, segundo) => primero.numeroBloque - segundo.numeroBloque);
  const agrupadas = agruparBloquesEnSesiones(destinos);
  if (destinos.length !== seleccionadas.length || !agrupadas.exito || agrupadas.valor.length !== 1) return rechazar("destino", "El destino no admite toda la duración de la clase de forma consecutiva.");
  if (destinos.some(bloque => contexto.bloquesReservadosIds.includes(bloque.id))) return rechazar("bloqueReservado", mensajeBloqueReservado);
  seleccionadas.sort((primera, segunda) => primera.bloque.numeroBloque - segunda.bloque.numeroBloque);
  const cambios = seleccionadas.map((entrada, indice) => ({ id: entrada.id, bloqueId: destinos[indice]!.id }));
  const nuevas = seleccionadas.map((entrada, indice) => ({ ...entrada, bloqueId: destinos[indice]!.id, bloque: destinos[indice]! }));
  const finales = [...contexto.entradas.filter(entrada => !datos.idsHorarios.includes(entrada.id)), ...nuevas];
  problemas.push(...comprobarDisponibilidad(contexto, nuevas));
  problemas.push(...conflictos(finales, new Set(datos.idsHorarios)));
  // Los destinos duplicados se rechazan por conflicto antes de agrupar sesiones.
  // No se impone el inicio impar a sesiones heredadas que este movimiento no cambia.
  if (!problemas.length && agruparEntradasResultado(finales).some(grupo => grupo.entradas.some(entrada => datos.idsHorarios.includes(entrada.id))
    && grupo.entradas[0]!.bloque.numeroBloque % 2 === 0)) return rechazar("sesionPar", "La sesión resultante del destino debe comenzar en un bloque institucional impar.");
  if (!problemas.length) problemas.push(...comprobarContinuidad(contexto, finales, new Set(datos.idsHorarios)));
  problemas.push(...comprobarCompatibilidadAcademica({ ...contexto, entradas: finales }));
  problemas.push(...comprobarRecursosResultado({ ...contexto, entradas: finales }));
  return { valido: problemas.length === 0, problemas, cambios };
}
/** Valida incorporación y Propuesta sin anticipar la asignación física posterior. */
export function validarPropuestaResultado(contexto: ContextoResultado) {
  const problemas: ProblemaResultado[] = conflictos(contexto.entradas);
  for (const entrada of contexto.entradas) if (contexto.bloquesReservadosIds.includes(entrada.bloqueId)) {
    problemas.push({ codigo: "bloqueReservado", mensaje: mensajeBloqueReservado, idsHorarios: [entrada.id], bloqueId: entrada.bloqueId });
  }
  problemas.push(...comprobarDisponibilidad(contexto, contexto.entradas));
  problemas.push(...comprobarCompatibilidadAcademica(contexto), ...comprobarRecursosResultado(contexto));
  // Los conflictos duplicados deben informarse sin convertir la agrupación en una excepción.
  if (!problemas.some(problema => problema.codigo === "seccion")) problemas.push(...comprobarContinuidad(contexto, contexto.entradas));
  for (const oferta of contexto.ofertas) for (const requisito of oferta.asignatura.tiposHora) {
    const entradas = contexto.entradas.filter(entrada => entrada.ofertaId === oferta.id && entrada.tipoHoraId === requisito.tipoHoraId);
    const cantidad = entradas.length;
    if (cantidad !== requisito.horas) problemas.push({ codigo: "carga", mensaje: `${oferta.asignatura.codigo}, sección ${oferta.seccion}: se requieren ${requisito.horas} bloques del tipo ${requisito.tipoHoraId} y hay ${cantidad}.`, ofertaId: oferta.id });
    if (new Set(entradas.map(entrada => entrada.asignacion.profesorId)).size > 1) problemas.push({ codigo: "docente", mensaje: "Cada componente de una sección debe tener un único docente.", ofertaId: oferta.id });
  }
  for (const entrada of contexto.entradas) if (!contexto.ofertas.some(oferta => oferta.id === entrada.ofertaId
    && oferta.asignatura.tiposHora.some(tipo => tipo.tipoHoraId === entrada.tipoHoraId && tipo.horas > 0))) {
    problemas.push({ codigo: "carga", mensaje: "Hay un bloque que no corresponde a la carga de una oferta del período.", idsHorarios: [entrada.id], ofertaId: entrada.ofertaId });
  }
  if (!contexto.entradas.length) problemas.push({ codigo: "carga", mensaje: "No hay horarios para publicar." });
  const advertencias: ProblemaResultado[] = contexto.ofertas.filter(oferta => !oferta.asignatura.requiereSala && oferta.asignatura.tiposHora.some(tipo => tipo.horas > 0))
    .map(oferta => ({ codigo: "requiereSala", mensaje: `${oferta.asignatura.codigo}, sección ${oferta.seccion}: tiene carga positiva aunque requiereSala=false. Su carga no se excluye de la validación.`, ofertaId: oferta.id }));
  return { valido: problemas.length === 0, problemas, advertencias, revision: revisionResultado(contexto) };
}
export function validarPublicacionResultado(contexto: ContextoResultado) {
  const resultado = validarPropuestaResultado(contexto);
  for (const entrada of contexto.entradas) if (solicitaSala(contexto, entrada) && entrada.salaId === null) {
    resultado.problemas.push({ codigo: "sala", mensaje: "Hay una clase que requiere sala sin asignación.", idsHorarios: [entrada.id], ofertaId: entrada.ofertaId });
  }
  return { ...resultado, valido: resultado.problemas.length === 0 };
}
