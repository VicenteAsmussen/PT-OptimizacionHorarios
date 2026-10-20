import { z } from "zod";

export const createOfertaValidation = z.object({
  asignaturaCodigo: z.string().trim().min(1).max(20),
  profesorId: z.number().int().positive(),
  planificacionSemestreId: z.number().int().positive(),
  seccion: z.number().int().positive().max(5).default(1),
  cupos: z.number().int().nonnegative().default(0),
}).strict();
export const updateOfertaValidation = createOfertaValidation.partial().extend({
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
