import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { ContextoDisponibilidad, Seleccion } from './types';

const ruta = 'disponibilidad-profesores/mi-disponibilidad';
export const disponibilidadApi = {
  consultar: async (planificacionSemestreId?: number, signal?: AbortSignal) => {
    const consulta = planificacionSemestreId === undefined ? ''
      : `?${new URLSearchParams({ planificacionSemestreId: String(planificacionSemestreId) })}`;
    return (await api<RespuestaExitosa<ContextoDisponibilidad>>(`${ruta}${consulta}`, { signal })).data;
  },
  enviar: async (planificacionSemestreId: number, bloquesIds: number[]) => (
    await api<RespuestaExitosa<Seleccion>>(ruta, {
      method: 'POST', body: JSON.stringify({ planificacionSemestreId, bloquesIds }),
    })
  ).data,
};
