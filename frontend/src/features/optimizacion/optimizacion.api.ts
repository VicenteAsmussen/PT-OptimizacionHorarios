import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { Ejecucion, Preparacion, Solicitud } from './types';

// Extrae las respuestas del servicio de optimización bajo su prefijo común.
async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(`optimizacion/${ruta}`, opciones)).data;
}
// Identifica el período al que pertenece la preparación o ejecución solicitada.
const planificacion = (id: number) => `planificaciones/${id}`;
export const optimizacionApi = {
  // Consulta recursos y bloqueos actuales antes de iniciar el cálculo.
  preparar: (id: number, signal?: AbortSignal) => leer<Preparacion>(`${planificacion(id)}/preparacion`, { signal }),
  // Envía la solicitud de cálculo con sus recursos y clave de idempotencia.
  iniciar: (id: number, solicitud: Solicitud) => leer<Ejecucion>(`${planificacion(id)}/ejecuciones`, { method: 'POST', body: JSON.stringify(solicitud) }),
  // Recupera el estado y diagnóstico de un intento identificado.
  consultar: (id: string, signal?: AbortSignal) => leer<Ejecucion>(`ejecuciones/${encodeURIComponent(id)}`, { signal }),
  // Recupera el intento más reciente del período sin iniciar otro cálculo.
  ultima: (id: number, signal?: AbortSignal) => leer<Ejecucion | null>(`${planificacion(id)}/ultima-ejecucion`, { signal }),
};
