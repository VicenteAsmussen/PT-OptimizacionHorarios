import type { PlanificacionSemestre } from '../asignaturas/types';

export type { PlanificacionSemestre };
export interface DepartamentoExterno {
  id: number;
  nombre: string;
  carreraDepartamentos: { carreraId: number; esGestionado: boolean }[];
}
export interface CoberturaExterna {
  codigo: string;
  nombre: string;
  semestreMalla: number;
  obligatorio: boolean;
  secciones: number[];
  estado: 'cargada' | 'faltante_obligatoria' | 'faltante_opcional' | 'invalida';
}
export interface ErrorImportacion {
  fila: number; columna: string; mensaje: string;
  codigoAsignatura?: string; nombreAsignatura?: string; valor?: string;
}
export interface ResultadoImportacion {
  ofertasCreadas: number; ofertasActualizadas: number; ofertasEliminadas: number; horariosCreados: number;
  cobertura: CoberturaExterna[]; errores: ErrorImportacion[];
}
export interface FalloImportacion { errores?: ErrorImportacion[]; data?: ResultadoImportacion }
export interface ResumenDepartamento {
  departamentoId: number; nombre: string; cargadas: number; total: number;
}
