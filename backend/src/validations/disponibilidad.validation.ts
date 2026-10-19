import { z } from "zod";

export const createDisponibilidadValidation = z.object({
  profesorId: z.number().int().positive(),
  planificacionSemestreId: z.number().int().positive(),
  bloqueId: z.number().int().positive(),
}).strict();
export const syncDisponibilidadValidation = createDisponibilidadValidation.omit({ bloqueId: true }).extend({
  bloquesIds: z.array(z.number().int().positive()).default([]),
});
export const disponibilidadQueryValidation = z.object({
  profesorId: z.coerce.number().int().positive().optional(),
  planificacionSemestreId: z.coerce.number().int().positive().optional(),
}).strict();
export const disponibilidadIdParamValidation = z.object({ id: z.coerce.number().int().positive() });
export const profesorPlanificacionParamValidation = z.object({
  profesorId: z.coerce.number().int().positive(),
  planificacionSemestreId: z.coerce.number().int().positive(),
});
export type CreateDisponibilidadDTO = z.infer<typeof createDisponibilidadValidation>;
export type SyncDisponibilidadDTO = z.infer<typeof syncDisponibilidadValidation>;
export type DisponibilidadQueryDTO = z.infer<typeof disponibilidadQueryValidation>;
export type DisponibilidadIdParamDTO = z.infer<typeof disponibilidadIdParamValidation>;
export type ProfesorPlanificacionParamDTO = z.infer<typeof profesorPlanificacionParamValidation>;
