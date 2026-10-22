import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { CoberturaExterna, DepartamentoExterno, PlanificacionSemestre, ResultadoImportacion } from './types';

async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
const consulta = (planificacionSemestreId: number, departamentoId: number) => new URLSearchParams({
  planificacionSemestreId: String(planificacionSemestreId), departamentoId: String(departamentoId),
});
export const horariosExternosApi = {
  planificaciones: () => leer<PlanificacionSemestre[]>('planificaciones-semestres'),
  departamentos: () => leer<DepartamentoExterno[]>('departamentos'),
  cobertura: (planificacionSemestreId: number, departamentoId: number) => leer<{ cobertura: CoberturaExterna[] }>(
    `horarios-asignaturas/excel/externos/cobertura?${consulta(planificacionSemestreId, departamentoId)}`),
  importar: (planificacionSemestreId: number, departamentoId: number, archivo: File) => {
    const formulario = new FormData(); formulario.append('archivo', archivo);
    return leer<ResultadoImportacion>(`horarios-asignaturas/excel/externos/importar?${consulta(planificacionSemestreId, departamentoId)}`,
      { method: 'POST', body: formulario });
  },
};
