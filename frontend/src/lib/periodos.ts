import type { PlanificacionSemestre } from '../types/periodos.ts';

// Presenta primero los períodos académicos de año y semestre más recientes.
export function ordenarPeriodosPorFechaAcademica<T extends { codigo: string }>(periodos: readonly T[]): T[] {
  return [...periodos].sort((primero, segundo) => {
    const [anioPrimero, semestrePrimero] = primero.codigo.split('-').map(Number);
    const [anioSegundo, semestreSegundo] = segundo.codigo.split('-').map(Number);
    return anioSegundo - anioPrimero || semestreSegundo - semestrePrimero;
  });
}

// Preselecciona un período solo cuando existe una única planificación actual.
export function planificacionInicial(planificaciones: readonly PlanificacionSemestre[]) {
  const actuales = planificaciones.filter(planificacion => planificacion.actual);
  // El administrador con varias carreras debe elegir, el código puede ser compartido.
  return actuales.length === 1 ? actuales[0].id : null;
}
// Explica si las secciones pueden editarse según la vigencia y el estado del período.
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
