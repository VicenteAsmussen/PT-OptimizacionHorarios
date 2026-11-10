export interface PlanificacionSemestre {
  id: number; carreraId: number; carrera: { id: number; nombre: string };
  codigo: string; actual: boolean; estadoPlanificacion: 'preparacion' | 'propuesta' | 'publicado';
}
