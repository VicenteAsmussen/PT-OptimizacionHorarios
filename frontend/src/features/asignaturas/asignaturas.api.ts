import { api } from '../../lib/api';
import type { RespuestaExitosa } from '../../types/auth';
import type { Asignatura, CambiosAsignatura, DatosOferta, Departamento, Oferta, ProfesorSeccion, Semestre } from './types';

async function leer<T>(ruta: string, opciones?: RequestInit) {
  return (await api<RespuestaExitosa<T>>(ruta, opciones)).data;
}
const escribir = (method: string, datos: object): RequestInit => ({ method, body: JSON.stringify(datos) });
export const asignaturasApi = {
  listar: () => leer<Asignatura[]>('asignaturas'),
  departamentos: () => leer<Departamento[]>('departamentos'),
  semestres: () => leer<Semestre[]>('semestres'),
  // Selección global mínima para admin/secretaria; no amplía el acceso de gestión de profesores.
  async profesores(): Promise<ProfesorSeccion[]> {
    const profesores = await leer<ProfesorSeccion[]>('profesores/seleccion');
    return profesores.map(({ id, nombre, rut, departamento }) => ({
      id, nombre, rut, departamento: { id: departamento.id, nombre: departamento.nombre },
    }));
  },
  editar: (codigo: string, datos: CambiosAsignatura) => leer<Asignatura>(
    `asignaturas/${encodeURIComponent(codigo)}`, escribir('PUT', datos)),
  ofertasSemestre: (semestreId: number) => leer<Oferta[]>(
    `ofertas-asignaturas?semestreId=${semestreId}`),
  ofertas: (codigo: string, semestreId: number) => leer<Oferta[]>(
    `ofertas-asignaturas?asignaturaCodigo=${encodeURIComponent(codigo)}&semestreId=${semestreId}`),
  crearOferta: (codigo: string, semestreId: number, datos: DatosOferta) => leer<Oferta>(
    'ofertas-asignaturas', escribir('POST', { asignaturaCodigo: codigo, semestreId, ...datos })),
  editarOferta: (id: number, datos: DatosOferta) => leer<Oferta>(`ofertas-asignaturas/${id}`, escribir('PUT', datos)),
  eliminarOferta: (id: number) => api<void>(`ofertas-asignaturas/${id}`, { method: 'DELETE' }),
};
