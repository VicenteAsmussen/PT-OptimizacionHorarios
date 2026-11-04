import { z } from "zod";

export const parametrosOptimizacion = z.object({ id: z.coerce.number().int().positive() });
export const identificadorEjecucion = z.object({ id: z.uuid() });
export const recursoOptimizacion = z.object({
  id: z.string().trim().min(1).max(120),
  edificio: z.string().trim().min(1).max(120),
  tipo: z.enum(["Sala", "Laboratorio"]),
  capacidad: z.number().int().positive().max(10000),
  cantidad: z.number().int().min(0).max(10000),
  fuente: z.string().trim().min(1).max(500),
}).strict();
export const inicioOptimizacion = z.object({
  claveIdempotencia: z.string().trim().min(8).max(120),
  recursos: z.array(recursoOptimizacion).min(1).max(200)
    .refine(recursos => new Set(recursos.map(recurso => recurso.id)).size === recursos.length, "Las categorías deben tener identificadores únicos."),
}).strict();
export type InicioOptimizacionDTO = z.infer<typeof inicioOptimizacion>;
