import { z } from "zod";

export const createProfesorValidation = z.object({
  nombre: z
    .string({ message: "El nombre del profesor es obligatorio" })
    .trim()
    .min(1, "El nombre del profesor no puede estar vacío")
    .max(150, "El nombre no puede exceder los 150 caracteres"),
  departamentoId: z
    .number({ message: "El ID del departamento es obligatorio" })
    .int("El ID del departamento debe ser un número entero")
    .positive("El ID del departamento debe ser mayor a 0"),
  tipo: z
    .string({ message: "El tipo de jornada del profesor es obligatorio" })
    .trim()
    .min(1, "El tipo de jornada no puede estar vacío")
    .max(50, "El tipo de jornada no puede exceder 50 caracteres"),
  usuarioId: z
    .number({ message: "El ID de usuario debe ser numérico" })
    .int("El ID de usuario debe ser un número entero")
    .positive("El ID de usuario debe ser mayor a 0")
    .optional(),
});

export const updateProfesorValidation = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre del profesor no puede estar vacío")
    .max(150, "El nombre no puede exceder los 150 caracteres")
    .optional(),
  departamentoId: z
    .number()
    .int("El ID del departamento debe ser un número entero")
    .positive("El ID del departamento debe ser mayor a 0")
    .optional(),
  tipo: z
    .string()
    .trim()
    .min(1, "El tipo de jornada no puede estar vacío")
    .max(50, "El tipo de jornada no puede exceder 50 caracteres")
    .optional(),
  usuarioId: z
    .number()
    .int("El ID de usuario debe ser un número entero")
    .positive("El ID de usuario debe ser mayor a 0")
    .optional(),
});

export const profesorIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export type CreateProfesorDTO = z.infer<typeof createProfesorValidation>;
export type UpdateProfesorDTO = z.infer<typeof updateProfesorValidation>;
export type ProfesorIdParamDTO = z.infer<typeof profesorIdParamValidation>;
