import { z } from "zod";

export const createSemestreValidation = z.object({
  codigo: z
    .string({ message: "El código del semestre es obligatorio" })
    .trim()
    .min(1, "El código del semestre no puede estar vacío")
    .max(20, "El código no puede exceder los 20 caracteres"),
  anio: z
    .number({ message: "El año es obligatorio y debe ser numérico" })
    .int("El año debe ser un número entero")
    .min(2000, "El año no puede ser menor a 2000")
    .max(2100, "El año no puede ser mayor a 2100"),
  actual: z.boolean().optional(),
  horarioPublicado: z.boolean().optional(),
});

export const updateSemestreValidation = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, "El código no puede estar vacío")
    .max(20, "El código no puede exceder los 20 caracteres")
    .optional(),
  anio: z
    .number()
    .int("El año debe ser un número entero")
    .min(2000, "El año no puede ser menor a 2000")
    .max(2100, "El año no puede ser mayor a 2100")
    .optional(),
  actual: z.boolean().optional(),
  horarioPublicado: z.boolean().optional(),
});

export const semestreIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export type CreateSemestreDTO = z.infer<typeof createSemestreValidation>;
export type UpdateSemestreDTO = z.infer<typeof updateSemestreValidation>;
export type SemestreIdParamDTO = z.infer<typeof semestreIdParamValidation>;
