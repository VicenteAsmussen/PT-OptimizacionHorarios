import type { Bloque, Planificacion } from '../disponibilidad/types';

export type { Bloque, Planificacion };
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
