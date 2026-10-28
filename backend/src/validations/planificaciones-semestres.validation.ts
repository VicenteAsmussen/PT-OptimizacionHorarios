import { z } from "zod";

// T3: las transiciones de estado tendrán comandos dedicados y bloqueo transaccional.
// Nunca aceptar estadoPlanificacion en PATCH/POST genérico.
const codigoPlanificacion = z.string().length(6).regex(/^[0-9]{4}-[12]$/);
export const createPlanificacionSemestreValidation = z.object({
  carreraId: z.number().int().positive(),
  codigo: codigoPlanificacion,
  actual: z.literal(true).default(true),
}).strict();
export const updatePlanificacionSemestreValidation = z.object({
  codigo: codigoPlanificacion.optional(),
  actual: z.boolean().optional(),
}).strict();
export const deletePlanificacionSemestreValidation = z.object({ confirmacion: codigoPlanificacion }).strict();
export const planificacionSemestreIdParamValidation = z.object({ id: z.coerce.number().int().positive() });
export const planificacionSemestreQueryValidation = z.object({ carreraId: z.coerce.number().int().positive().optional() }).strict();
export type CreatePlanificacionSemestreDTO = z.infer<typeof createPlanificacionSemestreValidation>;
export type UpdatePlanificacionSemestreDTO = z.infer<typeof updatePlanificacionSemestreValidation>;
