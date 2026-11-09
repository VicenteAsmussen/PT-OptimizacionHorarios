import { api, apiArchivo } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { ImportacionSalas, Movimiento, PlanificacionSemestre, ResultadoHorario, Validacion, ValidacionPublicacion } from './types';

async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
const raiz = (id: number) => `resultados-horarios/${id}`;
const escribir = (datos: object): RequestInit => ({ method: 'POST', body: JSON.stringify(datos) });
export const resultadosHorariosApi = {
  planificaciones: (signal?: AbortSignal) => leer<PlanificacionSemestre[]>('planificaciones-semestres', { signal }),
  consultar: (id: number, signal?: AbortSignal) => leer<ResultadoHorario>(raiz(id), { signal }),
  descartar: (id: number, revision: string) => leer<{ planificacion: ResultadoHorario['planificacion'] }>(`${raiz(id)}/descartar`, escribir({ revision, confirmar: true })),
  validarMovimiento: (id: number, datos: Movimiento, signal?: AbortSignal) => leer<Validacion>(`${raiz(id)}/validar-movimiento`, { ...escribir(datos), signal }),
  mover: (id: number, datos: Movimiento) => leer<ResultadoHorario>(`${raiz(id)}/movimientos`, escribir(datos)),
  exportar: (id: number, soloPendientes: boolean, signal?: AbortSignal) => apiArchivo(`${raiz(id)}/salas/exportar${soloPendientes ? '?soloPendientes=true' : ''}`, signal),
  importar: (id: number, revision: string, archivo: File) => {
    const datos = new FormData(); datos.append('archivo', archivo); datos.append('revision', revision);
    return leer<ImportacionSalas>(`${raiz(id)}/salas/importar`, { method: 'POST', body: datos });
  },
  validarPublicacion: (id: number, signal?: AbortSignal) => leer<ValidacionPublicacion>(`${raiz(id)}/validacion-publicacion`, { signal }),
  publicar: (id: number, revision: string) => leer<ResultadoHorario>(`${raiz(id)}/publicar`, escribir({ revision })),
};
