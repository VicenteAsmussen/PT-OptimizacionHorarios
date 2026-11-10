import type { Asignatura, Departamento, Oferta, ProfesorSeccion } from './types.ts';

const normalizar = (texto: string) => texto.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function filtrarAsignaturas(asignaturas: readonly Asignatura[], busqueda = '', departamento = '', malla = '',
  departamentos: readonly Pick<Departamento, 'id' | 'esGestionado'>[] = []) {
  const consulta = normalizar(busqueda);
  const esGrupo = departamento === 'gestionados' || departamento === 'no-gestionados';
  const idsGrupo = new Set(departamentos.filter(d => d.esGestionado === (departamento === 'gestionados')).map(d => d.id));
  return asignaturas.filter(a => (!departamento || (esGrupo ? idsGrupo.has(a.departamentoId) : a.departamentoId === Number(departamento)))
    && (!malla || a.semestreMalla === Number(malla))
    && (normalizar(a.nombre).includes(consulta) || normalizar(a.codigo).includes(consulta)))
    .sort((a, b) => a.semestreMalla - b.semestreMalla
      || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}
export function limpiarFiltros<T extends { busqueda: string; departamento: string; malla: string }>(filtros: T): T {
  return { ...filtros, busqueda: '', departamento: '', malla: '' };
}
export function contarSecciones(ofertas: readonly Oferta[], planificacionSemestreId: number | null) {
  const conteos = new Map<string, number>();
  for (const oferta of ofertas) {
    if (oferta.planificacionSemestreId === planificacionSemestreId) {
      conteos.set(oferta.asignaturaCodigo, (conteos.get(oferta.asignaturaCodigo) ?? 0) + 1);
    }
  }
  return conteos;
}
export function buscarProfesores(profesores: readonly ProfesorSeccion[], busqueda: string) {
  const consulta = normalizar(busqueda);
  const rut = /^[\d.k-]+$/i.test(consulta) ? consulta.replace(/[.-]/g, '') : '';
  return profesores.filter(p => normalizar(p.nombre).includes(consulta)
    || Boolean(rut && p.rut?.replace(/[.\-\s]/g, '').toLowerCase().includes(rut)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}
export function ofertasDePlanificacion(ofertas: readonly Oferta[], codigo: string, planificacionSemestreId: number | null) {
  return ofertas.filter(o => o.asignaturaCodigo === codigo && o.planificacionSemestreId === planificacionSemestreId)
    .sort((a, b) => a.seccion - b.seccion);
}
export function seccionesLibres(ofertas: readonly Oferta[], editandoId?: number) {
  const ocupadas = new Set(ofertas.filter(o => o.id !== editandoId).map(o => o.seccion));
  return [1, 2, 3, 4, 5].filter(numero => !ocupadas.has(numero));
}
export function prepararOferta(entrada: { seccion: string; cupos: string; asignaciones: { tipoHoraId: number; profesorId: number | null }[] },
  profesores: readonly ProfesorSeccion[], libres: readonly number[]) {
  const asignaciones = entrada.asignaciones.filter((a): a is { tipoHoraId: number; profesorId: number } => a.profesorId !== null);
  if (new Set(asignaciones.map(a => a.tipoHoraId)).size !== asignaciones.length
    || asignaciones.some(a => !Number.isInteger(a.tipoHoraId) || a.tipoHoraId <= 0 || !profesores.some(p => p.id === a.profesorId))) {
    throw new Error('Selecciona un profesor válido para cada tipo de hora asignado.');
  }
  const seccion = Number(entrada.seccion);
  if (!entrada.seccion.trim() || !Number.isInteger(seccion) || seccion < 1 || seccion > 5 || !libres.includes(seccion)) {
    throw new Error('Selecciona una sección disponible entre 1 y 5.');
  }
  const cupos = Number(entrada.cupos);
  if (!entrada.cupos.trim() || !Number.isSafeInteger(cupos) || cupos < 0) throw new Error('Los cupos deben ser un entero no negativo.');
  return { seccion, cupos, asignaciones };
}
export function tiposPendientes(asignatura: Asignatura, oferta: Oferta) {
  return (asignatura.tiposHora ?? []).filter(t => t.horas > 0 && !oferta.asignaciones.some(a => a.tipoHoraId === t.tipoHoraId));
}
export const puedeGestionarAsignaturas = (rol?: string) => rol === 'admin' || rol === 'secretaria';
export const puedeEditarAsignaturas = (rol?: string, asignatura?: Pick<Asignatura, 'tieneDependenciasAcademicas'>) =>
  rol === 'admin' && asignatura?.tieneDependenciasAcademicas !== true;
