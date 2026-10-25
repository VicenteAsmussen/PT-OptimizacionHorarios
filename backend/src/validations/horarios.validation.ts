import { z } from "zod";

export const createHorarioValidation = z.object({
  ofertaId: z.number().int().positive(),
  salaId: z.number().int().positive().nullable().optional(),
  bloqueId: z.number().int().positive(),
  tipoHoraId: z.number().int().positive(),
  planificacionSemestreId: z.number().int().positive().optional(),
}).strict();
export const updateHorarioValidation = createHorarioValidation.partial();
export const horarioIdParamValidation = z.object({ id: z.coerce.number().int().positive() });
export const ofertaParamValidation = z.object({ ofertaId: z.coerce.number().int().positive() });
export const horarioQueryValidation = z.object({
  planificacionSemestreId: z.coerce.number().int().positive().optional(),
  ofertaId: z.coerce.number().int().positive().optional(),
  salaId: z.coerce.number().int().positive().optional(),
  bloqueId: z.coerce.number().int().positive().optional(),
  semestreMalla: z.coerce.number().int().min(1).max(14).optional(),
  profesorId: z.coerce.number().int().positive().optional(),
}).strict();
export const excelSalasQueryValidation = z.object({ planificacionSemestreId: z.coerce.number().int().positive() });
export const excelExternosQueryValidation = excelSalasQueryValidation.extend({ departamentoId: z.coerce.number().int().positive() });
export const miHorarioQueryValidation = z.object({ planificacionSemestreId: z.coerce.number().int().positive().optional() }).strict();
export const contextoMiHorarioQueryValidation = z.object({}).strict();
export type ExcelSalasQueryDTO = z.infer<typeof excelSalasQueryValidation>;
export type CreateHorarioDTO = z.infer<typeof createHorarioValidation>;
export type UpdateHorarioDTO = z.infer<typeof updateHorarioValidation>;
export type HorarioIdParamDTO = z.infer<typeof horarioIdParamValidation>;
export type OfertaParamDTO = z.infer<typeof ofertaParamValidation>;
export type HorarioQueryDTO = z.infer<typeof horarioQueryValidation>;
export type MiHorarioQueryDTO = z.infer<typeof miHorarioQueryValidation>;
