import { z } from "zod";

export const VERSION_MODELO = "notebook-v2-1";
export const DIAS_MODELO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"] as const;
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const entero = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const texto = z.string().trim().min(1).max(200);
const componente = z.object({ tipoHoraId: id, tipo: z.enum(["T", "P", "L"]), horas: entero,
  profesorId: id.nullable() });
const oferta = z.object({ id, asignaturaCodigo: texto, seccion: id, cupos: entero,
  semestreMalla: id, esCritica: z.boolean(), requiereSala: z.boolean(), componentes: z.array(componente).max(3) });
const bloque = z.object({ id, dia: z.enum(DIAS_MODELO), numeroBloque: z.number().int().min(1).max(16) });
const externo = z.object({ ofertaId: id, asignaturaCodigo: texto, seccion: id, semestreMalla: id,
  tipoHoraId: id, bloqueId: id, esCritica: z.boolean().optional() });
const recurso = z.object({ id: texto, edificio: texto, tipo: z.enum(["Sala", "Laboratorio"]),
  capacidad: id, cantidad: entero, fuente: z.string().trim().min(1).max(1000) });
export const esquemaDatos = z.object({ ofertas: z.array(oferta), bloques: z.array(bloque),
  disponibilidades: z.array(z.object({ profesorId: id, bloqueId: id })),
  externos: z.array(externo), recursos: z.array(recurso), reservas: z.array(id) });
export const esquemaParametros = z.object({ limiteSolverSegundos: z.number().positive().max(300).default(300) }).strict();
const faltante = z.object({ ofertaId: id, tipoHoraId: id, horas: entero }).strict();
export const esquemaSalida = z.object({
  version: z.literal(1), revision: z.string().regex(/^[a-f0-9]{64}$/),
  estado: z.enum(["optimo", "factible", "limite_tiempo", "infactible", "sin_solucion"]),
  objetivo: z.number().finite().nonnegative().nullable(),
  asignaciones: z.array(z.object({ ofertaId: id, tipoHoraId: id, bloqueId: id, categoriaId: texto }).strict()),
  faltantes: z.array(faltante),
  protecciones: z.array(z.object({ parejaId: texto, ofertaAId: id, ofertaBId: id, protegida: z.boolean() }).strict()),
}).strict();

export type DatosOptimizacion = z.infer<typeof esquemaDatos>;
export type OfertaOptimizacion = DatosOptimizacion["ofertas"][number];
export type RecursoOptimizacion = DatosOptimizacion["recursos"][number];
export type ParametrosOptimizacion = z.input<typeof esquemaParametros>;
export type SalidaOptimizacion = z.infer<typeof esquemaSalida>;
export type AsignacionOptimizacion = SalidaOptimizacion["asignaciones"][number];
export type FaltanteOptimizacion = z.infer<typeof faltante>;
export interface ParejaOptimizacion {
  id: string;
  asignaturaA: string;
  asignaturaB: string;
  status: 1 | 0.5;
  seccionesA: number[];
  seccionesB: number[];
}
export interface EntradaOptimizacion extends DatosOptimizacion {
  version: 1;
  versionModelo: typeof VERSION_MODELO;
  revision: string;
  parametros: z.output<typeof esquemaParametros>;
  parejas: ParejaOptimizacion[];
  certificadoPrioridad: { cotaPenalidadFlexible: number; prioridadCertificada: boolean };
}
export interface ValidacionSalidaOptimizacion {
  valida: boolean;
  completa: boolean;
  errores: string[];
  faltantes: FaltanteOptimizacion[];
  disponibilidadDocente: { profesorId: number; bloquesDisponibles: number }[];
}
