import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { Asignatura, CambiosAsignatura, DatosOferta, Departamento, Oferta, ProfesorSeccion, PlanificacionSemestre } from './types';

async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
const escribir = (method: string, datos: object): RequestInit => ({ method, body: JSON.stringify(datos) });
export const asignaturasApi = {
  listar: () => leer<Asignatura[]>('asignaturas'),
  departamentos: () => leer<Departamento[]>('departamentos'),
  planificaciones: () => leer<PlanificacionSemestre[]>('planificaciones-semestres'),
  // Selección global mínima; no amplía el acceso de gestión de profesores.
  async profesores(): Promise<ProfesorSeccion[]> {
    const profesores = await leer<ProfesorSeccion[]>('profesores/seleccion');
    return profesores.map(({ id, nombre, rut, departamento }) => ({
      id, nombre, rut, departamento: { id: departamento.id, nombre: departamento.nombre },
    }));
  },
  editar: (codigo: string, datos: CambiosAsignatura) => leer<Asignatura>(
    `asignaturas/${encodeURIComponent(codigo)}`, escribir('PUT', datos)),
  ofertasPlanificacion: (planificacionSemestreId: number) => leer<Oferta[]>(
    `ofertas-asignaturas?planificacionSemestreId=${planificacionSemestreId}`),
  ofertas: (codigo: string, planificacionSemestreId: number) => leer<Oferta[]>(
    `ofertas-asignaturas?asignaturaCodigo=${encodeURIComponent(codigo)}&planificacionSemestreId=${planificacionSemestreId}`),
  crearOferta: (codigo: string, planificacionSemestreId: number, datos: DatosOferta) => leer<Oferta>(
    'ofertas-asignaturas', escribir('POST', { asignaturaCodigo: codigo, planificacionSemestreId, ...datos })),
  editarOferta: (id: number, datos: DatosOferta) => leer<Oferta>(`ofertas-asignaturas/${id}`, escribir('PUT', datos)),
  eliminarOferta: (id: number) => api<void>(`ofertas-asignaturas/${id}`, { method: 'DELETE' }),
};
