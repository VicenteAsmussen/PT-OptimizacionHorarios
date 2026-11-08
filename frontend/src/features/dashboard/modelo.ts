export interface PlanificacionPanel {
  id: number;
  codigo: string;
  carreraNombre: string;
  actual: boolean;
  estadoPlanificacion: 'preparacion' | 'propuesta' | 'publicado';
}
export interface ResumenPanel { mensaje: string; nota: string }

export function accionesPanel(rol: string, planificacion?: PlanificacionPanel) {
  const gestion = {
    nombre: 'Gestión del horario',
    ruta: `/app/resultados-horarios${planificacion ? `?planificacion=${planificacion.id}` : ''}`,
  };
  const modelo = {
    nombre: 'Modelo de optimización',
    ruta: `/app/optimizacion${planificacion ? `?planificacion=${planificacion.id}` : ''}`,
  };
  const seguimiento = { nombre: 'Seguimiento de disponibilidad', ruta: '/app/seguimiento-disponibilidad' };
  const disponibilidad = { nombre: 'Mi disponibilidad', ruta: '/app/disponibilidad' };
  const horario = { nombre: 'Mi horario', ruta: '/app/mi-horario' };
  const horarioVisible = planificacion?.estadoPlanificacion === 'propuesta' || planificacion?.estadoPlanificacion === 'publicado';
  if (rol === 'admin') return {
    titulo: 'Administración académica',
    descripcion: 'Administra los períodos de cada carrera y consulta su estado de planificación.',
    principal: { nombre: 'Administración de períodos', ruta: '/app/administracion-periodos' },
    secundarios: [{ nombre: 'Asignaturas', ruta: '/app/asignaturas' }, { nombre: 'Profesores', ruta: '/app/profesores' }],
  };
  if (rol === 'secretaria') return {
    titulo: horarioVisible ? 'Gestión del horario' : 'Disponibilidad docente',
    descripcion: planificacion?.estadoPlanificacion === 'publicado'
      ? 'Consulta el horario publicado de la planificación seleccionada.'
      : horarioVisible ? 'Revisa la propuesta de horario. Todavía no está publicada.'
        : 'Revisa los registros de disponibilidad antes de continuar con la planificación.',
    principal: horarioVisible ? gestion : seguimiento,
    secundarios: horarioVisible ? [seguimiento, modelo] : [modelo, gestion],
  };
  return {
    titulo: horarioVisible ? 'Consulta tu horario' : 'Tu disponibilidad docente',
    descripcion: planificacion?.estadoPlanificacion === 'propuesta'
      ? 'Puedes consultar la propuesta de tu horario, pero aún no está publicado.'
      : planificacion?.estadoPlanificacion === 'publicado' ? 'Consulta tu horario publicado.'
        : planificacion ? 'En Preparación, tu horario aún no está habilitado para consulta.'
          : 'Consulta tu disponibilidad y los períodos con asignaciones docentes.',
    principal: horarioVisible ? horario : disponibilidad,
    secundarios: horarioVisible ? [disponibilidad] : [horario],
  };
}
