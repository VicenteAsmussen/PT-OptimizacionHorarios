import { z } from "zod";

export const createDisponibilidadValidation = z.object({
  profesorId: z
    .number({ message: "El ID del profesor es obligatorio" })
    .int("El ID del profesor debe ser un número entero")
    .positive("El ID del profesor debe ser mayor a 0"),
  semestreId: z
    .number({ message: "El ID del semestre es obligatorio" })
    .int("El ID del semestre debe ser un número entero")
    .positive("El ID del semestre debe ser mayor a 0"),
  bloqueId: z
    .number({ message: "El ID del bloque horario es obligatorio" })
    .int("El ID del bloque horario debe ser un número entero")
    .positive("El ID del bloque horario debe ser mayor a 0"),
});

export const syncDisponibilidadValidation = z.object({
  profesorId: z
    .number({ message: "El ID del profesor es obligatorio" })
    .int("El ID del profesor debe ser un número entero")
    .positive("El ID del profesor debe ser mayor a 0"),
  semestreId: z
    .number({ message: "El ID del semestre es obligatorio" })
    .int("El ID del semestre debe ser un número entero")
    .positive("El ID del semestre debe ser mayor a 0"),
  bloquesIds: z
    .array(z.number().int().positive("Los IDs de bloques deben ser números positivos"), {
      message: "El listado de bloques horarios es obligatorio",
    })
    .default([]),
});

export const disponibilidadQueryValidation = z.object({
  profesorId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  semestreId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

export const disponibilidadIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export const profesorSemestreParamValidation = z.object({
  profesorId: z.coerce
    .number({ message: "El parámetro profesorId debe ser numérico" })
    .int("El profesorId debe ser un número entero")
    .positive("El profesorId debe ser mayor a 0"),
  semestreId: z.coerce
    .number({ message: "El parámetro semestreId debe ser numérico" })
    .int("El semestreId debe ser un número entero")
    .positive("El semestreId debe ser mayor a 0"),
});

export type CreateDisponibilidadDTO = z.infer<typeof createDisponibilidadValidation>;
export type SyncDisponibilidadDTO = z.infer<typeof syncDisponibilidadValidation>;
export type DisponibilidadQueryDTO = z.infer<typeof disponibilidadQueryValidation>;
export type DisponibilidadIdParamDTO = z.infer<typeof disponibilidadIdParamValidation>;
export type ProfesorSemestreParamDTO = z.infer<typeof profesorSemestreParamValidation>;
