import type { PlanificacionSemestre } from '../asignaturas/types.ts';

export type AlcanceReinicio = 'gestionadas' | 'externas' | 'todas';
export type ObjetivoReinicio = 'ofertas' | 'horarios';
export type EstadoPeriodo = PlanificacionSemestre['estadoPlanificacion'];
export interface ResumenPeriodo {
  planificacion: PlanificacionSemestre;
  alcance: AlcanceReinicio;
  ofertas: number;
  asignaciones: number;
  horarios: number;
  huella: string;
}
export const estadosPeriodo: Record<EstadoPeriodo, string> = {
  preparacion: 'Preparación', propuesta: 'Propuesta', publicado: 'Publicado',
};
export type ResumenesPeriodo = Record<AlcanceReinicio, ResumenPeriodo>;
export interface AccionReinicio {
  objetivo: ObjetivoReinicio;
  alcance: 'gestionadas' | 'externas';
  etiqueta: string;
  descripcion: string;
}
export const accionesReinicio: AccionReinicio[] = [
  { objetivo: 'horarios', alcance: 'gestionadas', etiqueta: 'Reiniciar horarios gestionados', descripcion: 'Elimina los bloques; conserva ofertas y docentes.' },
  { objetivo: 'horarios', alcance: 'externas', etiqueta: 'Reiniciar horarios externos', descripcion: 'Elimina los bloques; conserva ofertas y docentes.' },
  { objetivo: 'ofertas', alcance: 'gestionadas', etiqueta: 'Reiniciar ofertas gestionadas', descripcion: 'Elimina ofertas y asignaciones docentes.' },
  { objetivo: 'ofertas', alcance: 'externas', etiqueta: 'Reiniciar ofertas externas', descripcion: 'Elimina ofertas y asignaciones docentes.' },
];
export function puedeCambiarEstado(actual: EstadoPeriodo, nuevo: EstadoPeriodo, horariosGestionados: number) {
  return actual !== nuevo && (nuevo === 'preparacion' ? horariosGestionados === 0 : horariosGestionados > 0);
}
export function puedeReiniciar(accion: Pick<AccionReinicio, 'objetivo'>, resumen: Pick<ResumenPeriodo, 'ofertas' | 'horarios'>) {
  return resumen[accion.objetivo] > 0 && (accion.objetivo !== 'ofertas' || resumen.horarios === 0);
}
export const puedeAdministrarPeriodos = (rol?: string | null) => rol === 'admin';
export function carrerasDisponibles(planificaciones: Pick<PlanificacionSemestre, 'carrera'>[]) {
  return [...new Map(planificaciones.map(planificacion => [planificacion.carrera.id, planificacion.carrera])).values()];
}
export function confirmarReinicio(resumen: Pick<ResumenPeriodo, 'planificacion' | 'alcance'> | null,
  planificacionId: number, alcance: AlcanceReinicio, confirmacion: string) {
  return !!resumen && resumen.planificacion.id === planificacionId && resumen.alcance === alcance
    && confirmacion === resumen.planificacion.codigo;
}
