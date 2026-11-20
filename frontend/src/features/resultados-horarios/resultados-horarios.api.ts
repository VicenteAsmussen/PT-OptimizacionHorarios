import { api, apiArchivo } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { ImportacionSalas, Movimiento, PlanificacionSemestre, ResultadoHorario, Validacion, ValidacionPublicacion } from './types';

// Extrae los datos de consulta o gestión del horario desde la respuesta común.
async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
// Identifica el resultado de la planificación que recibirá cada operación.
const raiz = (id: number) => `resultados-horarios/${id}`;
// Prepara el cuerpo JSON de una operación sobre la propuesta horaria.
const escribir = (datos: object): RequestInit => ({ method: 'POST', body: JSON.stringify(datos) });
export const resultadosHorariosApi = {
  // Consulta los períodos disponibles para revisar resultados horarios.
  planificaciones: (signal?: AbortSignal) => leer<PlanificacionSemestre[]>('planificaciones-semestres', { signal }),
  // Recupera sesiones, reservas y disponibilidad del resultado seleccionado.
  consultar: (id: number, signal?: AbortSignal) => leer<ResultadoHorario>(raiz(id), { signal }),
  // Solicita descartar la revisión confirmada de la propuesta del período.
  descartar: (id: number, revision: string) => leer<{ planificacion: ResultadoHorario['planificacion'] }>(`${raiz(id)}/descartar`, escribir({ revision, confirmar: true })),
  // Consulta la validez de un movimiento sin modificar el horario.
  validarMovimiento: (id: number, datos: Movimiento, signal?: AbortSignal) => leer<Validacion>(`${raiz(id)}/validar-movimiento`, { ...escribir(datos), signal }),
  // Solicita guardar el desplazamiento del grupo horario seleccionado.
  mover: (id: number, datos: Movimiento) => leer<ResultadoHorario>(`${raiz(id)}/movimientos`, escribir(datos)),
  // Descarga la solicitud de salas completa o limitada a sesiones pendientes.
  exportar: (id: number, soloPendientes: boolean, signal?: AbortSignal) => apiArchivo(`${raiz(id)}/salas/exportar${soloPendientes ? '?soloPendientes=true' : ''}`, signal),
  // Envía la respuesta de salas junto con la revisión horaria que se está gestionando.
  importar: (id: number, revision: string, archivo: File) => {
    const datos = new FormData(); datos.append('archivo', archivo); datos.append('revision', revision);
    return leer<ImportacionSalas>(`${raiz(id)}/salas/importar`, { method: 'POST', body: datos });
  },
  // Consulta los problemas que impiden publicar la planificación completa.
  validarPublicacion: (id: number, signal?: AbortSignal) => leer<ValidacionPublicacion>(`${raiz(id)}/validacion-publicacion`, { signal }),
  // Solicita publicar la revisión confirmada de la propuesta académica.
  publicar: (id: number, revision: string) => leer<ResultadoHorario>(`${raiz(id)}/publicar`, escribir({ revision })),
};
