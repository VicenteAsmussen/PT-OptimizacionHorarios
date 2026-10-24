import type { Bloque, Planificacion, Seleccion } from './types.ts';

export const puedeRegistrarDisponibilidad = (rol: string | null | undefined) => rol === 'profesor';
export const planificacionesActuales = (planificaciones: Planificacion[]) => planificaciones.filter(p => p.actual);

const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export const claveDia = (dia: string) => dia.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function ordenarBloques(bloques: Bloque[]) {
  const ordenDia = (dia: string) => {
    const indice = dias.indexOf(claveDia(dia));
    return indice < 0 ? dias.length : indice;
  };
  return [...bloques].sort((a, b) => ordenDia(a.dia) - ordenDia(b.dia) || a.numeroBloque - b.numeroBloque);
}

export interface EstadoDisponibilidad {
  id: number | null;
  seleccion: Seleccion | null;
  bloquesIds: number[];
  modo: 'cargando' | 'edicion' | 'guardada' | 'enviando' | 'error';
  error: string;
}
type Accion = { tipo: 'consultar'; id: number | null }
  | { tipo: 'cargada' | 'guardada'; id: number; seleccion: Seleccion }
  | { tipo: 'fallo'; id: number; mensaje: string }
  | { tipo: 'permiso'; id: number; editable: boolean }
  | { tipo: 'alternar'; id: number }
  | { tipo: 'seleccionar_todos'; bloquesIds: number[] }
  | { tipo: 'deseleccionar_todos' }
  | { tipo: 'editar' | 'cancelar' | 'enviar' };

export const estadoInicial: EstadoDisponibilidad = {
  id: null, seleccion: null, bloquesIds: [], modo: 'cargando', error: '',
};
export const puedeEnviar = (estado: EstadoDisponibilidad) => estado.modo === 'edicion'
  && estado.seleccion?.editable === true && estado.seleccion.minimoBloques > 0
  && estado.bloquesIds.length >= estado.seleccion.minimoBloques;

export function reducirDisponibilidad(estado: EstadoDisponibilidad, accion: Accion): EstadoDisponibilidad {
  if (accion.tipo === 'permiso') {
    return accion.id === estado.id && estado.seleccion
      ? { ...estado, seleccion: { ...estado.seleccion, editable: accion.editable } } : estado;
  }
  if (accion.tipo === 'consultar') {
    return estado.modo === 'enviando' ? estado : { ...estadoInicial, id: accion.id };
  }
  if (accion.tipo === 'cargada' || accion.tipo === 'guardada') {
    if (accion.id !== estado.id || accion.seleccion.planificacionSemestreId !== estado.id) return estado;
    return { ...estado, seleccion: accion.seleccion, bloquesIds: [...accion.seleccion.bloquesIds], error: '',
      modo: accion.tipo === 'guardada' || accion.seleccion.bloquesIds.length > 0 || !accion.seleccion.editable ? 'guardada' : 'edicion' };
  }
  if (accion.tipo === 'fallo') {
    if (accion.id !== estado.id) return estado;
    return { ...estado, error: accion.mensaje, modo: estado.modo === 'enviando' ? 'edicion' : 'error' };
  }
  if (estado.modo === 'enviando' || !estado.seleccion?.editable) return estado;
  if (accion.tipo === 'editar' && estado.modo === 'guardada') return { ...estado, modo: 'edicion', error: '' };
  if (accion.tipo === 'cancelar' && estado.modo === 'edicion' && estado.seleccion.bloquesIds.length > 0) {
    return { ...estado, bloquesIds: [...estado.seleccion.bloquesIds], modo: 'guardada', error: '' };
  }
  if (accion.tipo === 'alternar' && estado.modo === 'edicion') {
    return { ...estado, error: '', bloquesIds: estado.bloquesIds.includes(accion.id)
      ? estado.bloquesIds.filter(id => id !== accion.id) : [...estado.bloquesIds, accion.id] };
  }
  if (accion.tipo === 'seleccionar_todos' && estado.modo === 'edicion') {
    return { ...estado, error: '', bloquesIds: [...new Set(accion.bloquesIds)] };
  }
  if (accion.tipo === 'deseleccionar_todos' && estado.modo === 'edicion') {
    return { ...estado, error: '', bloquesIds: [] };
  }
  if (accion.tipo === 'enviar' && puedeEnviar(estado)) return { ...estado, modo: 'enviando', error: '' };
  return estado;
}
