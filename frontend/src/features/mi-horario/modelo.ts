import { claveDia, ordenarBloques } from '../disponibilidad/estado';
import { estadoSecciones } from '../../lib/periodos';
import type { Bloque, ClaseHorario } from './types.ts';

// Habilita el horario personal únicamente para docentes autenticados.
export const puedeConsultarMiHorario = (rol: string | null | undefined) => rol === 'profesor';
// Mantiene en el selector los períodos con estados académicos reconocidos.
export const planificacionesVisibles = <T extends { estadoPlanificacion: string }>(planificaciones: T[]) =>
  planificaciones.filter(p => p.estadoPlanificacion === 'preparacion' || p.estadoPlanificacion === 'propuesta' || p.estadoPlanificacion === 'publicado');
// Comparte la etiqueta académica del período con las otras pantallas.
export const etiquetaEstado = (planificacion: { estadoPlanificacion: string }) => estadoSecciones(planificacion).etiqueta;

// Condensa el nombre de una asignatura en iniciales para su presentación.
export const inicialesAsignatura = (nombre: string) => nombre.trim().split(/\s+/)
  .map(palabra => palabra.match(/[\p{L}\p{N}]/u)?.[0] ?? '').join('').toLocaleUpperCase('es');

// Acorta los componentes horarios conocidos sin ocultar tipos no reconocidos.
export function abreviarTipoClase(tipo: string) {
  const clave = tipo.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const abreviaturas: Record<string, string> = { teorica: 'teo', practica: 'prac', laboratorio: 'lab' };
  return abreviaturas[clave] ?? tipo;
}

// Identifica la franja horaria usada para alinear las clases de distintos días.
const rangoHorario = (bloque: Bloque) => `${bloque.horaInicio.slice(0, 5)}–${bloque.horaTermino.slice(0, 5)}`;

// Prepara el detalle académico de la clase e identifica la ausencia de sala.
export function describirClase(clase: ClaseHorario) {
  return { asignatura: clase.oferta.asignatura.nombre, seccion: `Sección ${clase.oferta.seccion}`,
    tipo: clase.tipoHora.tipo, sala: clase.sala?.nombre ?? 'sin sala' };
}

// Distribuye únicamente las clases del período consultado por día y franja.
export function crearCalendario(bloques: Bloque[], horarios: ClaseHorario[], planificacionId: number) {
  const ordenados = ordenarBloques(bloques);
  const dias = [...new Map(ordenados.map(b => [claveDia(b.dia), { clave: claveDia(b.dia), nombre: b.dia }])).values()];
  const franjas = [...new Set(ordenados.map(rangoHorario))].sort();
  const propias = horarios.filter(h => h.planificacionSemestreId === planificacionId);
  return { dias, filas: franjas.map(horario => ({ horario, celdas: dias.map(dia => {
    const bloque = ordenados.find(b => claveDia(b.dia) === dia.clave && rangoHorario(b) === horario);
    return { bloque, clases: bloque ? propias.filter(h => h.bloqueId === bloque.id) : [] };
  }) })) };
}

interface EstadoHorario {
  id: number | null;
  horarios: ClaseHorario[];
  modo: 'cargando' | 'cargado' | 'error';
  error: string;
}
type AccionHorario = { tipo: 'seleccionar'; id: number }
  | { tipo: 'cargado'; id: number; horarios: ClaseHorario[] }
  | { tipo: 'fallo'; id: number; mensaje: string };
export const estadoInicial: EstadoHorario = { id: null, horarios: [], modo: 'cargando', error: '' };
// Aplica resultados del horario personal solo a la selección de período vigente.
export function reducirHorario(estado: EstadoHorario, accion: AccionHorario): EstadoHorario {
  if (accion.tipo === 'seleccionar') return { ...estadoInicial, id: accion.id };
  if (estado.id !== accion.id) return estado;
  if (accion.tipo === 'fallo') return { ...estado, horarios: [], modo: 'error', error: accion.mensaje };
  return { ...estado, horarios: accion.horarios.filter(h => h.planificacionSemestreId === estado.id), modo: 'cargado', error: '' };
}
