import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { Asignatura, CambiosAsignatura, DatosOferta, Departamento, Oferta, ProfesorSeccion } from './types';
import type { PlanificacionSemestre } from '../../types/periodos';

// Extrae los datos de catálogo o secciones del contrato común de la API.
async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
// Prepara el cuerpo de una escritura de catálogo o sección.
const escribir = (method: string, datos: object): RequestInit => ({ method, body: JSON.stringify(datos) });
export const asignaturasApi = {
  // Consulta el catálogo de asignaturas accesible para la cuenta.
  listar: () => leer<Asignatura[]>('asignaturas'),
  // Consulta los departamentos usados para filtrar y editar asignaturas.
  departamentos: () => leer<Departamento[]>('departamentos'),
  // Recupera los períodos que contextualizan las secciones del catálogo.
  planificaciones: () => leer<PlanificacionSemestre[]>('planificaciones-semestres'),
  // La selección global es mínima, no amplía los permisos de gestión docente.
  // Recupera una proyección docente mínima para asignaciones por tipo de hora.
  async profesores(): Promise<ProfesorSeccion[]> {
    const profesores = await leer<ProfesorSeccion[]>('profesores/seleccion');
    return profesores.map(({ id, nombre, rut, departamento }) => ({
      id, nombre, rut, departamento: { id: departamento.id, nombre: departamento.nombre },
    }));
  },
  // Solicita actualizar la identidad académica de una asignatura.
  editar: (codigo: string, datos: CambiosAsignatura) => leer<Asignatura>(
    `asignaturas/${encodeURIComponent(codigo)}`, escribir('PUT', datos)),
  // Consulta las ofertas del período para calcular sus conteos de secciones.
  ofertasPlanificacion: (planificacionSemestreId: number) => leer<Oferta[]>(
    `ofertas-asignaturas?planificacionSemestreId=${planificacionSemestreId}`),
  // Consulta las secciones de una asignatura en el período elegido.
  ofertas: (codigo: string, planificacionSemestreId: number) => leer<Oferta[]>(
    `ofertas-asignaturas?asignaturaCodigo=${encodeURIComponent(codigo)}&planificacionSemestreId=${planificacionSemestreId}`),
  // Solicita abrir una sección con cupos y asignaciones docentes en el período.
  crearOferta: (codigo: string, planificacionSemestreId: number, datos: DatosOferta) => leer<Oferta>(
    'ofertas-asignaturas', escribir('POST', { asignaturaCodigo: codigo, planificacionSemestreId, ...datos })),
  // Solicita cambiar cupos y asignaciones de una sección existente.
  editarOferta: (id: number, datos: DatosOferta) => leer<Oferta>(`ofertas-asignaturas/${id}`, escribir('PUT', datos)),
  // Solicita retirar una sección sujeta a las restricciones del servidor.
  eliminarOferta: (id: number) => api<void>(`ofertas-asignaturas/${id}`, { method: 'DELETE' }),
};
