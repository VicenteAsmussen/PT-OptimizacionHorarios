import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { CoberturaExterna, DepartamentoExterno, PlanificacionSemestre, ResultadoImportacion } from './types';

// Extrae los datos de cobertura o importación desde el contrato común de respuesta.
async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
// Vincula cada operación externa con su período y departamento de destino.
const consulta = (planificacionSemestreId: number, departamentoId: number) => new URLSearchParams({
  planificacionSemestreId: String(planificacionSemestreId), departamentoId: String(departamentoId),
});
export const horariosExternosApi = {
  // Recupera los períodos que contextualizan la carga de departamentos externos.
  planificaciones: () => leer<PlanificacionSemestre[]>('planificaciones-semestres'),
  // Consulta las relaciones departamentales usadas para identificar carga externa.
  departamentos: () => leer<DepartamentoExterno[]>('departamentos'),
  // Consulta las asignaturas cubiertas por la carga externa guardada.
  cobertura: (planificacionSemestreId: number, departamentoId: number) => leer<{ cobertura: CoberturaExterna[] }>(
    `horarios-asignaturas/excel/externos/cobertura?${consulta(planificacionSemestreId, departamentoId)}`),
  // Envía la planilla para reemplazar la carga del departamento en el período elegido.
  importar: (planificacionSemestreId: number, departamentoId: number, archivo: File) => {
    const formulario = new FormData(); formulario.append('archivo', archivo);
    return leer<ResultadoImportacion>(`horarios-asignaturas/excel/externos/importar?${consulta(planificacionSemestreId, departamentoId)}`,
      { method: 'POST', body: formulario });
  },
};
