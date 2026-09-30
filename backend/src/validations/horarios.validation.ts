import { z } from "zod";

export const createHorarioValidation = z.object({
  ofertaId: z
    .number({ message: "El ID de la oferta de asignatura es obligatorio" })
    .int("El ID de la oferta debe ser un número entero")
    .positive("El ID de la oferta debe ser mayor a 0"),
  salaId: z
    .number({ message: "El ID de la sala debe ser numérico" })
    .int("El ID de la sala debe ser un número entero")
    .positive("El ID de la sala debe ser mayor a 0")
    .optional()
    .nullable(),
  bloqueId: z
    .number({ message: "El ID del bloque horario es obligatorio" })
    .int("El ID del bloque horario debe ser un número entero")
    .positive("El ID del bloque horario debe ser mayor a 0"),
  tipoHoraId: z
    .number({ message: "El ID del tipo de hora es obligatorio" })
    .int("El ID del tipo de hora debe ser un número entero")
    .positive("El ID del tipo de hora debe ser mayor a 0"),
  semestreId: z
    .number({ message: "El ID del semestre debe ser numérico" })
    .int("El ID del semestre debe ser un número entero")
    .positive("El ID del semestre debe ser mayor a 0")
    .optional(),
});

export const updateHorarioValidation = z.object({
  ofertaId: z
    .number()
    .int("El ID de la oferta debe ser un número entero")
    .positive("El ID de la oferta debe ser mayor a 0")
    .optional(),
  salaId: z
    .number()
    .int("El ID de la sala debe ser un número entero")
    .positive("El ID de la sala debe ser mayor a 0")
    .optional()
    .nullable(),
  bloqueId: z
    .number()
    .int("El ID del bloque horario debe ser un número entero")
    .positive("El ID del bloque horario debe ser mayor a 0")
    .optional(),
  tipoHoraId: z
    .number()
    .int("El ID del tipo de hora debe ser un número entero")
    .positive("El ID del tipo de hora debe ser mayor a 0")
    .optional(),
  semestreId: z
    .number()
    .int("El ID del semestre debe ser un número entero")
    .positive("El ID del semestre debe ser mayor a 0")
    .optional(),
});

export const horarioIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export const ofertaParamValidation = z.object({
  ofertaId: z.coerce
    .number({ message: "El parámetro ofertaId debe ser numérico" })
    .int("El ID de la oferta debe ser un número entero")
    .positive("El ID de la oferta debe ser mayor a 0"),
});

export const horarioQueryValidation = z.object({
  semestreId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  ofertaId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  salaId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  bloqueId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  semestreMalla: z.coerce
    .number()
    .int()
    .min(1, "El semestre de la malla debe ser al menos 1")
    .max(14, "El semestre de la malla no puede superar 14")
    .optional(),
  profesorId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

export const miHorarioQueryValidation = z.object({
  semestreId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

export type CreateHorarioDTO = z.infer<typeof createHorarioValidation>;
export type UpdateHorarioDTO = z.infer<typeof updateHorarioValidation>;
export type HorarioIdParamDTO = z.infer<typeof horarioIdParamValidation>;
export type OfertaParamDTO = z.infer<typeof ofertaParamValidation>;
export type HorarioQueryDTO = z.infer<typeof horarioQueryValidation>;
export type MiHorarioQueryDTO = z.infer<typeof miHorarioQueryValidation>;

