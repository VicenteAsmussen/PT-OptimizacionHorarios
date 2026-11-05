import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { Ejecucion, Preparacion, Solicitud } from './types';

async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(`optimizacion/${ruta}`, opciones)).data;
}
const planificacion = (id: number) => `planificaciones/${id}`;
export const optimizacionApi = {
  preparar: (id: number, signal?: AbortSignal) => leer<Preparacion>(`${planificacion(id)}/preparacion`, { signal }),
  iniciar: (id: number, solicitud: Solicitud) => leer<Ejecucion>(`${planificacion(id)}/ejecuciones`, { method: 'POST', body: JSON.stringify(solicitud) }),
  consultar: (id: string, signal?: AbortSignal) => leer<Ejecucion>(`ejecuciones/${encodeURIComponent(id)}`, { signal }),
  ultima: (id: number, signal?: AbortSignal) => leer<Ejecucion | null>(`${planificacion(id)}/ultima-ejecucion`, { signal }),
};
