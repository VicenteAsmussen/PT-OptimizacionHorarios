import { z } from "zod";

// T3: las transiciones de estado tendrán comandos dedicados y bloqueo transaccional.
// Nunca aceptar estadoPlanificacion en PATCH/POST genérico.
export const createPlanificacionSemestreValidation = z.object({
  carreraId: z.number().int().positive(),
  codigo: z.string().length(6).regex(/^[0-9]{4}-[12]$/),
  actual: z.boolean().default(false),
}).strict();
export const updatePlanificacionSemestreValidation = createPlanificacionSemestreValidation.omit({ carreraId: true }).partial().extend({ actual: z.boolean().optional() });
export const planificacionSemestreIdParamValidation = z.object({ id: z.coerce.number().int().positive() });
export const planificacionSemestreQueryValidation = z.object({ carreraId: z.coerce.number().int().positive().optional() }).strict();
export type CreatePlanificacionSemestreDTO = z.infer<typeof createPlanificacionSemestreValidation>;
export type UpdatePlanificacionSemestreDTO = z.infer<typeof updatePlanificacionSemestreValidation>;
