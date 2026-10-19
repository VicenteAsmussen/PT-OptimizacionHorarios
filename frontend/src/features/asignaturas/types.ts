export interface Departamento { id: number; nombre: string }
export interface Asignatura {
  codigo: string;
  nombre: string;
  departamentoId: number;
  departamento: Departamento;
  semestreMalla: number;
  esCritica: boolean;
}
export interface Semestre { id: number; codigo: string; actual: boolean }
export interface ProfesorSeccion {
  id: number;
  nombre: string;
  rut: string;
  departamento: Departamento;
}
export interface Oferta {
  id: number;
  asignaturaCodigo: string;
  semestreId: number;
  seccion: number;
  profesorId: number;
  cupos: number;
  profesor: { nombre: string };
  horarios: { id: number }[];
}
export interface DatosOferta { seccion: number; profesorId: number; cupos: number }
export type CambiosAsignatura = Pick<Asignatura, 'nombre' | 'departamentoId' | 'semestreMalla' | 'esCritica'>;
