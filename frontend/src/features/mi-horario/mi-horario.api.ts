import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { ClaseHorario, ContextoHorario } from './types';

const ruta = 'horarios-asignaturas/mi-horario';
export const miHorarioApi = {
  contexto: async (signal?: AbortSignal) => (await api<RespuestaExitosa<ContextoHorario>>(`${ruta}/contexto`, { signal })).data,
  consultar: async (planificacionSemestreId: number, signal?: AbortSignal) => (
    await api<RespuestaExitosa<ClaseHorario[]>>(`${ruta}?${new URLSearchParams({ planificacionSemestreId: String(planificacionSemestreId) })}`, { signal })
  ).data,
};
