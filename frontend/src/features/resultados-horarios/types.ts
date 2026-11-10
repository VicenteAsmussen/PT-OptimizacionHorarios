import type { Bloque } from '../mi-horario/types';
import type { PlanificacionSemestre } from '../../types/periodos';

export type { Bloque, PlanificacionSemestre };
export interface SesionResultado {
  idsHorarios: number[]; bloquesIds: number[]; ofertaId: number;
  asignatura: { codigo: string; nombre: string; semestreMalla: number };
  seccion: number; profesor: { nombre: string }; profesorId: number;
  tipoHora: { id: number; tipo: string }; dia: string; horaInicio: string; horaTermino: string;
  salas: ({ id: number; nombre: string } | null)[];
  estadoSala: 'asignada' | 'pendiente' | 'noRequiere' | 'laboratorio' | 'externa'; editable: boolean;
}
export interface ResultadoHorario {
  planificacion: Omit<PlanificacionSemestre, 'carrera'>; revision: string; bloques: Bloque[];
  disponibilidades: { profesorId: number; bloqueId: number; planificacionSemestreId: number }[];
  bloquesReservadosIds?: number[];
  pendientesSala: number; sesiones: SesionResultado[];
}
export interface Movimiento { revision: string; idsHorarios: number[]; bloqueInicioId: number }
export interface Problema { codigo: string; mensaje: string; idsHorarios?: number[]; bloqueId?: number; ofertaId?: number }
export interface Validacion { valido: boolean; problemas: Problema[] }
export interface ValidacionMovimiento extends Validacion { clave: string }
export interface ValidacionPublicacion extends Validacion { revision: string }
export interface ErrorPlanilla { fila: number; columna: string; mensaje: string }
export interface ImportacionSalas { actualizadas: number; pendientes: number; omitidas?: number; errores: ErrorPlanilla[] }
