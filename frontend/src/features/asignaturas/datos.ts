import type { Asignatura, Oferta, ProfesorSeccion, PlanificacionSemestre } from './types.ts';

const normalizar = (texto: string) => texto.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function filtrarAsignaturas(asignaturas: readonly Asignatura[], busqueda = '', departamento = '', malla = '') {
  const consulta = normalizar(busqueda);
  return asignaturas.filter(a => (!departamento || a.departamentoId === Number(departamento))
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
export function planificacionInicial(planificaciones: readonly PlanificacionSemestre[]) {
  const actuales = planificaciones.filter(planificacion => planificacion.actual);
  // Un admin con varias carreras debe elegir; no inferir dueño por código compartido.
  return actuales.length === 1 ? actuales[0].id : null;
}
export function estadoSecciones(planificacion?: { actual?: unknown; estadoPlanificacion?: unknown } | null) {
  const estado = planificacion?.estadoPlanificacion;
  const etiqueta = estado === 'preparacion' ? 'Preparación'
    : estado === 'propuesta' ? 'Propuesta' : estado === 'publicado' ? 'Publicado' : 'Estado no disponible';
  const actual = planificacion?.actual === true;
  const puedeEditar = actual && estado === 'preparacion';
  const razones: string[] = [];
  if (!actual) razones.push('esta planificación no es la actual');
  if (estado === 'propuesta' || estado === 'publicado') razones.push(`las secciones están congeladas en estado ${etiqueta}`);
  else if (estado !== 'preparacion') razones.push('no se pudo verificar el estado de la planificación');
  return { etiqueta, puedeEditar, motivo: puedeEditar ? ''
    : `Solo lectura: ${razones.join('; ')}. Puedes consultar las secciones. Para editarlas, cierra el panel y selecciona una planificación actual en Preparación.` };
}
export function ofertasDePlanificacion(ofertas: readonly Oferta[], codigo: string, planificacionSemestreId: number | null) {
  return ofertas.filter(o => o.asignaturaCodigo === codigo && o.planificacionSemestreId === planificacionSemestreId)
    .sort((a, b) => a.seccion - b.seccion);
}
export function seccionesLibres(ofertas: readonly Oferta[], editandoId?: number) {
  const ocupadas = new Set(ofertas.filter(o => o.id !== editandoId).map(o => o.seccion));
  return [1, 2, 3, 4, 5].filter(numero => !ocupadas.has(numero));
}
export function prepararOferta(entrada: { seccion: string; cupos: string; profesorId: number | null },
  profesores: readonly ProfesorSeccion[], libres: readonly number[]) {
  if (!profesores.some(p => p.id === entrada.profesorId)) throw new Error('Selecciona un profesor válido de los resultados.');
  const seccion = Number(entrada.seccion);
  if (!entrada.seccion.trim() || !Number.isInteger(seccion) || seccion < 1 || seccion > 5 || !libres.includes(seccion)) {
    throw new Error('Selecciona una sección disponible entre 1 y 5.');
  }
  const cupos = Number(entrada.cupos);
  if (!entrada.cupos.trim() || !Number.isSafeInteger(cupos) || cupos < 0) throw new Error('Los cupos deben ser un entero no negativo.');
  return { seccion, cupos, profesorId: entrada.profesorId! };
}
export const puedeGestionarAsignaturas = (rol?: string) => rol === 'admin' || rol === 'secretaria';
