import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { PlanificacionSemestre } from '../../types/periodos';
import type { AlcanceReinicio, ObjetivoReinicio, ResumenPeriodo, EstadoPeriodo } from './modelo';

// Extrae los datos de una operación administrativa del contrato de la API.
async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
export const administracionPeriodosApi = {
  // Consulta las carreras entre las que el administrador puede elegir.
  carreras: () => leer<PlanificacionSemestre['carrera'][]>('carreras'),
  // Recupera la lista de períodos sin reutilizar una respuesta en caché.
  planificaciones: () => leer<PlanificacionSemestre[]>('planificaciones-semestres', { cache: 'no-store' }),
  // Solicita crear un período académico para la carrera elegida.
  crear: (datos: Pick<PlanificacionSemestre, 'carreraId' | 'codigo'>) =>
    leer<Omit<PlanificacionSemestre, 'carrera'>>('planificaciones-semestres', { method: 'POST', body: JSON.stringify(datos) }),
  // Solicita designar el período actual de su carrera sin cambiar su estado.
  marcarActual: (id: number) => leer<Omit<PlanificacionSemestre, 'carrera'>>(`planificaciones-semestres/${id}`, { method: 'PATCH', body: JSON.stringify({ actual: true }) }),
  // Solicita eliminar el período con el código de confirmación proporcionado.
  eliminar: (id: number, confirmacion: string) => leer<Omit<PlanificacionSemestre, 'carrera'>>(`planificaciones-semestres/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmacion }) }),
  // Consulta cantidades y huella del alcance que se revisará antes de un reinicio.
  resumen: (id: number, alcance: AlcanceReinicio) => leer<ResumenPeriodo>(`administracion-periodos/${id}/resumen?alcance=${alcance}`, { cache: 'no-store' }),
  // Solicita el reinicio confirmado usando la huella del resumen revisado.
  reiniciar: (id: number, datos: { alcance: AlcanceReinicio; objetivo: ObjetivoReinicio; confirmacion: string; huella: string }) =>
    leer<{ ofertas: number; asignaciones: number; horarios: number }>(`administracion-periodos/${id}/reiniciar`, { method: 'POST', body: JSON.stringify(datos) }),
  // Solicita una transición de estado indicando el estado académico observado.
  cambiarEstado: (id: number, estadoAnterior: EstadoPeriodo, estadoPlanificacion: EstadoPeriodo) =>
    leer<PlanificacionSemestre>(`administracion-periodos/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estadoAnterior, estadoPlanificacion }) }),
};
