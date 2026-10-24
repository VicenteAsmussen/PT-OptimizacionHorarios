export interface Planificacion {
  id: number;
  codigo: string;
  carreraNombre: string;
  estadoPlanificacion: 'preparacion' | 'propuesta' | 'publicado';
  actual: boolean;
}

export interface Bloque {
  id: number;
  dia: string;
  numeroBloque: number;
  horaInicio: string;
  horaTermino: string;
}

export interface Carga {
  ofertaId: number;
  asignaturaCodigo: string;
  asignaturaNombre: string;
  seccion: number;
  tipoHoraId: number;
  tipoHoraNombre: string;
  horas: number;
}

export interface Seleccion {
  planificacionSemestreId: number;
  bloquesIds: number[];
  minimoBloques: number;
  carga: Carga[];
  editable: boolean;
}

export interface ContextoDisponibilidad {
  planificaciones: Planificacion[];
  bloques: Bloque[];
  seleccion: Seleccion | null;
}
