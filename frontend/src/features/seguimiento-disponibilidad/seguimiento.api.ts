import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { PlanificacionSemestre } from '../asignaturas/types';
import type { FilaSeguimiento } from './types';

export const seguimientoApi = {
  async planificaciones() {
    return (await api<RespuestaExitosa<PlanificacionSemestre[]>>('planificaciones-semestres')).data;
  },
  async consultar(planificacionSemestreId: number) {
    const consulta = new URLSearchParams({ planificacionSemestreId: String(planificacionSemestreId) });
    return (await api<RespuestaExitosa<FilaSeguimiento[]>>(`disponibilidad-profesores/seguimiento?${consulta}`)).data;
  },
};
