import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { PlanificacionSemestre } from '../../types/periodos';
import type { FilaSeguimiento } from './types';

export const seguimientoApi = {
  // Recupera las planificaciones entre las que se elige el seguimiento docente.
  async planificaciones() {
    return (await api<RespuestaExitosa<PlanificacionSemestre[]>>('planificaciones-semestres')).data;
  },
  // Consulta los registros docentes del período dentro del alcance autorizado por el servidor.
  async consultar(planificacionSemestreId: number) {
    const consulta = new URLSearchParams({ planificacionSemestreId: String(planificacionSemestreId) });
    return (await api<RespuestaExitosa<FilaSeguimiento[]>>(`disponibilidad-profesores/seguimiento?${consulta}`)).data;
  },
};
