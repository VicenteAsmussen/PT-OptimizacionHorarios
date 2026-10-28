import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { PlanificacionSemestre } from '../asignaturas/types';
import type { AlcanceReinicio, ObjetivoReinicio, ResumenPeriodo, EstadoPeriodo } from './modelo';

async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
export const administracionPeriodosApi = {
  carreras: () => leer<PlanificacionSemestre['carrera'][]>('carreras'),
  planificaciones: () => leer<PlanificacionSemestre[]>('planificaciones-semestres', { cache: 'no-store' }),
  crear: (datos: Pick<PlanificacionSemestre, 'carreraId' | 'codigo'>) =>
    leer<Omit<PlanificacionSemestre, 'carrera'>>('planificaciones-semestres', { method: 'POST', body: JSON.stringify(datos) }),
  marcarActual: (id: number) => leer<Omit<PlanificacionSemestre, 'carrera'>>(`planificaciones-semestres/${id}`, { method: 'PATCH', body: JSON.stringify({ actual: true }) }),
  eliminar: (id: number, confirmacion: string) => leer<Omit<PlanificacionSemestre, 'carrera'>>(`planificaciones-semestres/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmacion }) }),
  resumen: (id: number, alcance: AlcanceReinicio) => leer<ResumenPeriodo>(`administracion-periodos/${id}/resumen?alcance=${alcance}`, { cache: 'no-store' }),
  reiniciar: (id: number, datos: { alcance: AlcanceReinicio; objetivo: ObjetivoReinicio; confirmacion: string; huella: string }) =>
    leer<{ ofertas: number; asignaciones: number; horarios: number }>(`administracion-periodos/${id}/reiniciar`, { method: 'POST', body: JSON.stringify(datos) }),
  cambiarEstado: (id: number, estadoAnterior: EstadoPeriodo, estadoPlanificacion: EstadoPeriodo) =>
    leer<PlanificacionSemestre>(`administracion-periodos/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estadoAnterior, estadoPlanificacion }) }),
};
