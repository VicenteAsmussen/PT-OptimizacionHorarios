import { z } from "zod";

export const createOfertaValidation = z.object({
  asignaturaCodigo: z
    .string({ message: "El código de la asignatura es obligatorio" })
    .trim()
    .min(1, "El código de la asignatura no puede estar vacío")
    .max(20, "El código de la asignatura no puede exceder los 20 caracteres"),
  profesorId: z
    .number({ message: "El ID del profesor es obligatorio" })
    .int("El ID del profesor debe ser un número entero")
    .positive("El ID del profesor debe ser mayor a 0"),
  semestreId: z
    .number({ message: "El ID del semestre es obligatorio" })
    .int("El ID del semestre debe ser un número entero")
    .positive("El ID del semestre debe ser mayor a 0"),
  seccion: z
    .number({ message: "La sección debe ser un número" })
    .int("La sección debe ser un número entero")
    .positive("La sección debe ser mayor a 0")
    .optional()
    .default(1),
  cupos: z
    .number({ message: "La cantidad de cupos debe ser un número" })
    .int("La cantidad de cupos debe ser un número entero")
    .nonnegative("Los cupos no pueden ser negativos")
    .optional()
    .default(0),
});

export const updateOfertaValidation = z.object({
  asignaturaCodigo: z
    .string()
    .trim()
    .min(1, "El código de la asignatura no puede estar vacío")
    .max(20, "El código de la asignatura no puede exceder los 20 caracteres")
    .optional(),
  profesorId: z
    .number()
    .int("El ID del profesor debe ser un número entero")
    .positive("El ID del profesor debe ser mayor a 0")
    .optional(),
  semestreId: z
    .number()
    .int("El ID del semestre debe ser un número entero")
    .positive("El ID del semestre debe ser mayor a 0")
    .optional(),
  seccion: z
    .number()
    .int("La sección debe ser un número entero")
    .positive("La sección debe ser mayor a 0")
    .optional(),
  cupos: z
    .number()
    .int("La cantidad de cupos debe ser un número entero")
    .nonnegative("Los cupos no pueden ser negativos")
    .optional(),
});

export const ofertaIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export const ofertaQueryValidation = z.object({
  semestreId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  profesorId: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  asignaturaCodigo: z
    .string()
    .trim()
    .optional(),
});

export type CreateOfertaDTO = z.infer<typeof createOfertaValidation>;
export type UpdateOfertaDTO = z.infer<typeof updateOfertaValidation>;
export type OfertaIdParamDTO = z.infer<typeof ofertaIdParamValidation>;
export type OfertaQueryDTO = z.infer<typeof ofertaQueryValidation>;
