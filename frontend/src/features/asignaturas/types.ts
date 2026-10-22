export interface Departamento { id: number; nombre: string }
export interface Asignatura {
  codigo: string;
  nombre: string;
  departamentoId: number;
  departamento: Departamento;
  semestreMalla: number;
  esCritica: boolean;
  tiposHora: { tipoHoraId: number; horas: number; tipoHora: { id: number; tipo: string } }[];
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
  asignaciones: { tipoHoraId: number; profesorId: number; tipoHora: { tipo: string }; profesor: { nombre: string } }[];
  cupos: number;
  horarios: { id: number }[];
}
export interface DatosOferta { seccion: number; asignaciones: { tipoHoraId: number; profesorId: number }[]; cupos: number }
export type CambiosAsignatura = Pick<Asignatura, 'nombre' | 'departamentoId' | 'semestreMalla' | 'esCritica'>;
