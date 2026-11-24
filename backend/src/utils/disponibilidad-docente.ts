type BloqueGuardado = { profesorId: number; planificacionSemestreId: number; bloqueId: number };

// Resume la carga seleccionada y los bloques únicos guardados, sin descontar reservas.
export function resumirDisponibilidadDocente(horasAsignadas: number[], disponibilidades: BloqueGuardado[],
  profesorId: number, planificacionSemestreId: number) {
  const minimoBloques = horasAsignadas.reduce((suma, horas) => suma + horas, 0);
  const bloquesEnviados = new Set(disponibilidades.filter(fila =>
    fila.profesorId === profesorId && fila.planificacionSemestreId === planificacionSemestreId).map(fila => fila.bloqueId)).size;
  return { minimoBloques, bloquesEnviados };
}

export type DocenteSinDisponibilidad = ReturnType<typeof resumirDisponibilidadDocente> & { profesorId: number; nombre: string };
