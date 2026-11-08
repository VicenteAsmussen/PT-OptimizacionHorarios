import { asignaturasApi } from '../asignaturas/asignaturas.api';
import { planificacionInicial } from '../asignaturas/datos';
import { miHorarioApi } from '../mi-horario/mi-horario.api';
import { disponibilidadApi } from '../disponibilidad/disponibilidad.api';
import { seguimientoApi } from '../seguimiento-disponibilidad/seguimiento.api';
import type { PlanificacionPanel, ResumenPanel } from './modelo';

export async function cargarPlanificaciones(rol: string): Promise<{ planificaciones: PlanificacionPanel[]; inicial: number | null }> {
  if (rol === 'profesor') {
    const { planificaciones } = await miHorarioApi.contexto();
    const actuales = planificaciones.filter(planificacion => planificacion.actual);
    return { planificaciones, inicial: actuales.length === 1 ? actuales[0].id : null };
  }
  if (rol !== 'admin' && rol !== 'secretaria') return { planificaciones: [], inicial: null };
  const datos = await asignaturasApi.planificaciones();
  const disponibles = rol === 'secretaria' ? datos.filter(planificacion => planificacion.actual) : datos;
  return {
    planificaciones: disponibles.map(planificacion => ({ ...planificacion, carreraNombre: planificacion.carrera.nombre })),
    inicial: planificacionInicial(disponibles),
  };
}

export async function cargarResumen(rol: string, planificacion: PlanificacionPanel): Promise<ResumenPanel | null> {
  if (!planificacion.actual) return null;
  if (rol === 'secretaria' && planificacion.estadoPlanificacion === 'preparacion') {
    const filas = await seguimientoApi.consultar(planificacion.id);
    const registradas = filas.filter(fila => fila.enviada).length;
    return {
      mensaje: filas.length === 0 ? 'No hay profesores con carga asignada en los departamentos gestionados.'
        : `${registradas} con disponibilidad registrada · ${filas.length - registradas} sin registrar`,
      nota: 'Solo docentes con carga en departamentos gestionados de esta carrera y período. El registro no acredita cumplimiento del mínimo ni factibilidad del horario.',
    };
  }
  if (rol !== 'profesor') return null;
  const datos = await disponibilidadApi.consultar(planificacion.id);
  const actual = datos.planificaciones.find(disponible => disponible.id === planificacion.id && disponible.actual);
  const seleccion = datos.seleccion;
  if (!actual || actual.estadoPlanificacion !== planificacion.estadoPlanificacion
    || !seleccion || seleccion.planificacionSemestreId !== planificacion.id) {
    throw new Error('El contexto cambió. Actualiza el panel para consultar el estado vigente.');
  }
  if (seleccion.minimoBloques <= 0 || !seleccion.carga.some(asignacion => asignacion.horas > 0)) {
    return { mensaje: 'No tienes carga que requiera registrar disponibilidad en este período.', nota: 'Puedes consultar tus asignaciones en Mi horario.' };
  }
  return {
    mensaje: seleccion.bloquesIds.length > 0 ? 'Disponibilidad registrada.' : 'No has registrado disponibilidad en este período.',
    nota: seleccion.bloqueadaPorOptimizacion ? 'La edición está bloqueada mientras se ejecuta la optimización.'
      : seleccion.editable && actual.estadoPlanificacion === 'preparacion'
        ? 'Puedes revisar o completar tus bloques en Mi disponibilidad.'
        : 'La disponibilidad está disponible para consulta, sin edición habilitada.',
  };
}
