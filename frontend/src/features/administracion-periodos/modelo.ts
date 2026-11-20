import type { PlanificacionSemestre } from '../../types/periodos.ts';

export type AlcanceReinicio = 'gestionadas' | 'externas' | 'todas';
export type ObjetivoReinicio = 'ofertas' | 'horarios';
export type EstadoPeriodo = PlanificacionSemestre['estadoPlanificacion'];
export interface ResumenPeriodo {
  planificacion: PlanificacionSemestre;
  alcance: AlcanceReinicio;
  ofertas: number;
  asignaciones: number;
  horarios: number;
  ejecuciones?: number;
  huella: string;
}
export const estadosPeriodo: Record<EstadoPeriodo, string> = {
  preparacion: 'Preparación', propuesta: 'Propuesta', publicado: 'Publicado',
};
export type ResumenesPeriodo = Record<AlcanceReinicio, ResumenPeriodo>;
// Habilita eliminar solo el período revisado en Preparación y sin ofertas.
export function puedeEliminarPeriodo(resumen: ResumenPeriodo, planificacionId: number) {
  return resumen.alcance === 'todas' && resumen.planificacion.id === planificacionId
    && resumen.planificacion.estadoPlanificacion === 'preparacion' && resumen.ofertas === 0;
}
export interface AccionReinicio {
  objetivo: ObjetivoReinicio;
  alcance: 'gestionadas' | 'externas';
  etiqueta: string;
  descripcion: string;
}
export const accionesReinicio: AccionReinicio[] = [
  { objetivo: 'horarios', alcance: 'gestionadas', etiqueta: 'Reiniciar horarios gestionados', descripcion: 'Elimina los bloques y el registro de ejecución del modelo. Conserva ofertas, docentes y horarios externos.' },
  { objetivo: 'horarios', alcance: 'externas', etiqueta: 'Reiniciar horarios externos', descripcion: 'Elimina los bloques; conserva ofertas y docentes.' },
  { objetivo: 'ofertas', alcance: 'gestionadas', etiqueta: 'Reiniciar ofertas gestionadas', descripcion: 'Elimina ofertas y asignaciones docentes.' },
  { objetivo: 'ofertas', alcance: 'externas', etiqueta: 'Reiniciar ofertas externas', descripcion: 'Elimina ofertas y asignaciones docentes.' },
];
// Evalúa la transición administrativa según la presencia de horarios gestionados.
export function puedeCambiarEstado(actual: EstadoPeriodo, nuevo: EstadoPeriodo, horariosGestionados: number) {
  return actual !== nuevo && (nuevo === 'preparacion' ? horariosGestionados === 0 : horariosGestionados > 0);
}
// Habilita reinicios con datos y exige retirar horarios antes que ofertas.
export function puedeReiniciar(accion: Pick<AccionReinicio, 'objetivo'> & Partial<Pick<AccionReinicio, 'alcance'>>, resumen: Pick<ResumenPeriodo, 'ofertas' | 'horarios' | 'ejecuciones'>) {
  return (resumen[accion.objetivo] > 0 || (accion.objetivo === 'horarios' && accion.alcance === 'gestionadas' && (resumen.ejecuciones ?? 0) > 0))
    && (accion.objetivo !== 'ofertas' || resumen.horarios === 0);
}
// Reserva la administración del ciclo de períodos al rol administrador.
export const puedeAdministrarPeriodos = (rol?: string | null) => rol === 'admin';
// Reúne las carreras representadas sin repetirlas por cada período académico.
export function carrerasDisponibles(planificaciones: Pick<PlanificacionSemestre, 'carrera'>[]) {
  return [...new Map(planificaciones.map(planificacion => [planificacion.carrera.id, planificacion.carrera])).values()];
}
// Vincula el código escrito con el período y el alcance efectivamente revisados.
export function confirmarReinicio(resumen: Pick<ResumenPeriodo, 'planificacion' | 'alcance'> | null,
  planificacionId: number, alcance: AlcanceReinicio, confirmacion: string) {
  return !!resumen && resumen.planificacion.id === planificacionId && resumen.alcance === alcance
    && confirmacion === resumen.planificacion.codigo;
}
