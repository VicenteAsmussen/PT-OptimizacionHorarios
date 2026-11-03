import type { Bloque, Planificacion as PlanificacionBase } from '../disponibilidad/types';

export type { Bloque };
export interface Planificacion extends PlanificacionBase {
  carreraId?: number;
  bloquesReservadosIds?: number[];
}
export interface ClaseHorario {
  id: number;
  bloqueId: number;
  planificacionSemestreId: number;
  oferta: { asignatura: { nombre: string }; seccion: number };
  tipoHora: { tipo: string };
  sala: { nombre: string } | null;
}
export interface ContextoHorario {
  planificaciones: Planificacion[];
  bloques: Bloque[];
}
