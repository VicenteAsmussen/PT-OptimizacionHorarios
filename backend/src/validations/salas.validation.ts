import { z } from "zod";

export const tipoSalaEnum = ["Sala", "Laboratorio"] as const;

export const createSalaValidation = z.object({
  nombre: z
    .string({ message: "El nombre de la sala es obligatorio" })
    .trim()
    .min(1, "El nombre de la sala no puede estar vacío")
    .max(100, "El nombre no puede exceder 100 caracteres"),
  capacidad: z
    .number({ message: "La capacidad es obligatoria y debe ser numérica" })
    .int("La capacidad debe ser un número entero")
    .positive("La capacidad debe ser mayor a 0"),
  tipo: z.enum(tipoSalaEnum, {
    message: "El tipo de sala debe ser 'Sala' o 'Laboratorio'",
  }),
});

export const updateSalaValidation = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la sala no puede estar vacío")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .optional(),
  capacidad: z
    .number()
    .int("La capacidad debe ser un número entero")
    .positive("La capacidad debe ser mayor a 0")
    .optional(),
  tipo: z
    .enum(tipoSalaEnum, {
      message: "El tipo de sala debe ser 'Sala' o 'Laboratorio'",
    })
    .optional(),
});

export const salaIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export type CreateSalaDTO = z.infer<typeof createSalaValidation>;
export type UpdateSalaDTO = z.infer<typeof updateSalaValidation>;
export type SalaIdParamDTO = z.infer<typeof salaIdParamValidation>;
