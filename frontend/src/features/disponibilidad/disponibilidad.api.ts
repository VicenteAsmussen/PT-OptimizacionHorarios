import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { ContextoDisponibilidad, Seleccion } from './types';

const ruta = 'disponibilidad-profesores/mi-disponibilidad';
export const disponibilidadApi = {
  // Recupera períodos, bloques y disponibilidad propia para el contexto solicitado.
  consultar: async (planificacionSemestreId?: number, signal?: AbortSignal) => {
    const consulta = planificacionSemestreId === undefined ? ''
      : `?${new URLSearchParams({ planificacionSemestreId: String(planificacionSemestreId) })}`;
    return (await api<RespuestaExitosa<ContextoDisponibilidad>>(`${ruta}${consulta}`, { signal })).data;
  },
  // Solicita guardar los bloques declarados por el profesor para un período.
  enviar: async (planificacionSemestreId: number, bloquesIds: number[]) => (
    await api<RespuestaExitosa<Seleccion>>(ruta, {
      method: 'POST', body: JSON.stringify({ planificacionSemestreId, bloquesIds }),
    })
  ).data,
};
