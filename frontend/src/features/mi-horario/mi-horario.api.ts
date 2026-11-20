import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { ClaseHorario, ContextoHorario } from './types';

const ruta = 'horarios-asignaturas/mi-horario';
export const miHorarioApi = {
  // Recupera los períodos y bloques disponibles para la consulta del docente.
  contexto: async (signal?: AbortSignal) => (await api<RespuestaExitosa<ContextoHorario>>(`${ruta}/contexto`, { signal })).data,
  // Consulta las clases propias correspondientes al período solicitado.
  consultar: async (planificacionSemestreId: number, signal?: AbortSignal) => (
    await api<RespuestaExitosa<ClaseHorario[]>>(`${ruta}?${new URLSearchParams({ planificacionSemestreId: String(planificacionSemestreId) })}`, { signal })
  ).data,
};
