import { z } from "zod";

const asignacionesValidation = z.array(z.object({
  tipoHoraId: z.number().int().positive(),
  profesorId: z.number().int().positive(),
}).strict()).refine(asignaciones => new Set(asignaciones.map(a => a.tipoHoraId)).size === asignaciones.length,
  "No se puede asignar más de un profesor al mismo tipo de hora");

export const createOfertaValidation = z.object({
  asignaturaCodigo: z.string().trim().min(1).max(20),
  asignaciones: asignacionesValidation.default([]),
  planificacionSemestreId: z.number().int().positive(),
  seccion: z.number().int().positive().max(5).default(1),
  cupos: z.number().int().nonnegative().default(0),
}).strict();
export const updateOfertaValidation = createOfertaValidation.partial().extend({
  asignaciones: asignacionesValidation.optional(),
  seccion: z.number().int().positive().max(5).optional(),
  cupos: z.number().int().nonnegative().optional(),
});
export const ofertaIdParamValidation = z.object({ id: z.coerce.number().int().positive() });
export const ofertaQueryValidation = z.object({
  planificacionSemestreId: z.coerce.number().int().positive().optional(),
  profesorId: z.coerce.number().int().positive().optional(),
  asignaturaCodigo: z.string().trim().optional(),
}).strict();
export type CreateOfertaDTO = z.infer<typeof createOfertaValidation>;
export type UpdateOfertaDTO = z.infer<typeof updateOfertaValidation>;
export type OfertaIdParamDTO = z.infer<typeof ofertaIdParamValidation>;
export type OfertaQueryDTO = z.infer<typeof ofertaQueryValidation>;
