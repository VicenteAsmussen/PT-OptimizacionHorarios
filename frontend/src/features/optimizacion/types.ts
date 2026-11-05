export type EstadoEjecucion = 'en_ejecucion' | 'aplicada' | 'infactible' | 'carga_incompleta' | 'limite_tiempo' | 'error' | 'interrumpida' | 'datos_desactualizados';
export interface Recurso { id: string; edificio: string; tipo: 'Sala' | 'Laboratorio'; capacidad: number; cantidad: number; fuente: string }
export interface CategoriaSala extends Omit<Recurso, 'cantidad'> { cantidadCatalogo: number; cantidadSugerida: number }
export interface Disponibilidad { profesorId: number; bloquesDisponibles: number }
export interface CertificadoPrioridad { prioridadCertificada: boolean }
export interface Preparacion {
  planificacion: { id: number; carreraId: number; codigo: string; actual: boolean; estadoPlanificacion: string };
  puedeEjecutar: boolean; bloqueos: string[]; ejecucionActivaId: string | null; revisionEntrada: string;
  categoriasSalas: CategoriaSala[]; diagnosticosCatalogo: { salaId: number; mensaje: string }[];
  laboratorios: { requiereDeclaracion: boolean; mensaje: string }; limiteSolverSegundos: number;
  disponibilidadDocente: Disponibilidad[]; certificadoPrioridad: CertificadoPrioridad | null; advertencia: string;
}
export interface Diagnostico {
  mensaje?: string; codigo?: string; fase?: string; errores?: string[]; valida?: boolean; completa?: boolean;
  faltantes?: { ofertaId: number; asignaturaCodigo: string; seccion: number; tipoHoraId: number; componente?: string; horas: number }[];
  disponibilidadDocente?: Disponibilidad[]; certificadoPrioridad?: CertificadoPrioridad;
}
export interface Solicitud { claveIdempotencia: string; recursos: Recurso[] }
export interface Ejecucion {
  id: string; planificacionSemestreId: number; estado: EstadoEjecucion; versionModelo: string; revisionEntrada: string;
  parametros: { recursos: Recurso[] }; iniciadaEn: string; finalizadaEn: string | null;
  resultado: { estado: string; objetivo: number | null } | null; diagnostico: Diagnostico | null; reutilizada?: boolean;
}
export interface BorradorRecurso { id: string; edificio: string; capacidad: string; cantidad: string; fuente: string }
