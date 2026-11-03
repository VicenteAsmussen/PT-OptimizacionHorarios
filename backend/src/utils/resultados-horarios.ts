import { createHash } from "node:crypto";
import type { horariosRepository } from "../repositories/horarios.repository.js";
import type { BloqueHorario } from "../db/schema/bloques-horarios.schema.js";
import type { PlanificacionSemestre } from "../db/schema/planificaciones-semestres.schema.js";
import { agruparBloquesEnSesiones, normalizarDia } from "./excel-salas.js";
import { normalizarTipoHoraExcel } from "./excel-comun.js";
import { esObligatoriaExterna } from "./cobertura-externos.js";
import { BadRequestError } from "./errors.js";
import { mensajeBloqueReservado } from "./bloques-reservados.js";

export type EntradaResultado = Awaited<ReturnType<typeof horariosRepository.findParaExportarSalas>>[number];
export type AsignaturaResultado = EntradaResultado["oferta"]["asignatura"];
export interface ContextoResultado {
  planificacion: PlanificacionSemestre;
  entradas: EntradaResultado[];
  ofertas: (Omit<EntradaResultado["oferta"], "asignatura"> & { asignatura: AsignaturaResultado })[];
  asignaturasMalla: AsignaturaResultado[];
  bloques: BloqueHorario[];
  salas: { id: number; nombre: string; tipo: string }[];
  disponibilidades: { profesorId: number; bloqueId: number; planificacionSemestreId: number }[];
  departamentosGestionadosIds: number[];
  bloquesReservadosIds: number[];
}
export interface ProblemaResultado { codigo: string; mensaje: string; idsHorarios?: number[]; bloqueId?: number; ofertaId?: number }
export interface MovimientoResultado { revision: string; idsHorarios: number[]; bloqueInicioId: number }

// Query ordering must never create false stale-revision failures.
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
    if (primera.oferta.asignatura.semestreMalla === segunda.oferta.asignatura.semestreMalla) problemas.push({ codigo: "nivel", mensaje: "Hay otra clase del mismo nivel semestral en este bloque.", idsHorarios, bloqueId });
    if (primera.salaId !== null && primera.salaId === segunda.salaId) problemas.push({ codigo: "salaOcupada", mensaje: "La sala está ocupada en este bloque.", idsHorarios, bloqueId });
  }
  return problemas;
}
function comprobarDisponibilidad(contexto: ContextoResultado, entradas: EntradaResultado[]) {
  const disponibles = new Set(contexto.disponibilidades.filter(fila => fila.planificacionSemestreId === contexto.planificacion.id).map(fila => `${fila.profesorId}:${fila.bloqueId}`));
  return entradas.filter(entrada => esGestionada(contexto, entrada) && !disponibles.has(`${entrada.asignacion.profesorId}:${entrada.bloqueId}`))
    .map(entrada => ({ codigo: "disponibilidad", mensaje: "El profesor no tiene disponibilidad declarada en este bloque.", idsHorarios: [entrada.id], bloqueId: entrada.bloqueId }));
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
  // Conflicting destinations can contain duplicate blocks; reject those through the existing conflict contract.
  // Only sessions containing moved records acquire a new start invariant, not unrelated legacy teaching.
  if (!problemas.length && agruparEntradasResultado(finales).some(grupo => grupo.entradas.some(entrada => datos.idsHorarios.includes(entrada.id))
    && grupo.entradas[0]!.bloque.numeroBloque % 2 === 0)) return rechazar("sesionPar", "La sesión resultante del destino debe comenzar en un bloque institucional impar.");
  return { valido: problemas.length === 0, problemas, cambios };
}
export function validarPublicacionResultado(contexto: ContextoResultado) {
  const problemas: ProblemaResultado[] = conflictos(contexto.entradas);
  for (const entrada of contexto.entradas) if (contexto.bloquesReservadosIds.includes(entrada.bloqueId)) {
    problemas.push({ codigo: "bloqueReservado", mensaje: mensajeBloqueReservado, idsHorarios: [entrada.id], bloqueId: entrada.bloqueId });
  }
  problemas.push(...comprobarDisponibilidad(contexto, contexto.entradas));
  for (const entrada of contexto.entradas) if (solicitaSala(contexto, entrada) && entrada.salaId === null) problemas.push({ codigo: "sala", mensaje: "Hay una clase que requiere sala sin asignación.", idsHorarios: [entrada.id], ofertaId: entrada.ofertaId });
  for (const oferta of contexto.ofertas) for (const requisito of oferta.asignatura.tiposHora) {
    const cantidad = contexto.entradas.filter(entrada => entrada.ofertaId === oferta.id && entrada.tipoHoraId === requisito.tipoHoraId).length;
    if (cantidad !== requisito.horas) problemas.push({ codigo: "carga", mensaje: `${oferta.asignatura.codigo}, sección ${oferta.seccion}: se requieren ${requisito.horas} bloques del tipo ${requisito.tipoHoraId} y hay ${cantidad}.`, ofertaId: oferta.id });
  }
  for (const asignatura of contexto.asignaturasMalla) if (esObligatoriaExterna(asignatura.semestreMalla, contexto.planificacion.codigo)
    && asignatura.tiposHora.some(tipo => tipo.horas > 0) && !contexto.ofertas.some(oferta => oferta.asignaturaCodigo === asignatura.codigo)) {
    problemas.push({ codigo: "carga", mensaje: `${asignatura.codigo}: falta una oferta para la asignatura del período.` });
  }
  if (!contexto.entradas.length) problemas.push({ codigo: "carga", mensaje: "No hay horarios para publicar." });
  return { valido: problemas.length === 0, problemas, revision: revisionResultado(contexto) };
}
