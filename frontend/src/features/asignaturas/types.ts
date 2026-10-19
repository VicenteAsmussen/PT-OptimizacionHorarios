export interface Departamento { id: number; nombre: string }
export interface Asignatura {
  codigo: string;
  nombre: string;
  departamentoId: number;
  departamento: Departamento;
  semestreMalla: number;
  esCritica: boolean;
}
export interface PlanificacionSemestre {
  id: number; carreraId: number; carrera: { id: number; nombre: string };
  codigo: string; actual: boolean; estadoPlanificacion: 'preparacion' | 'propuesta' | 'publicado';
}
export interface ProfesorSeccion {
  id: number;
  nombre: string;
  rut: string;
  departamento: Departamento;
}
export interface Oferta {
  id: number;
  asignaturaCodigo: string;
  planificacionSemestreId: number;
  seccion: number;
  profesorId: number;
  cupos: number;
  profesor: { nombre: string };
  horarios: { id: number }[];
}
export interface DatosOferta { seccion: number; profesorId: number; cupos: number }
export type CambiosAsignatura = Pick<Asignatura, 'nombre' | 'departamentoId' | 'semestreMalla' | 'esCritica'>;
