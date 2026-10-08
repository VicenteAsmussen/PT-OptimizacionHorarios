import { z } from "zod";

const departamentosIdsValidation = z.array(
  z.number().int().positive("Los IDs de departamentos deben ser enteros positivos")
);

export const createCarreraValidation = z.object({
  nombre: z
    .string({ message: "El nombre de la carrera es obligatorio" })
    .trim()
    .min(1, "El nombre de la carrera no puede estar vacío")
    .max(150, "El nombre no puede exceder los 150 caracteres"),
  departamentosIds: departamentosIdsValidation.optional().default([]),
  departamentosGestionadosIds: departamentosIdsValidation.optional().default([]),
});

export const updateCarreraValidation = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la carrera no puede estar vacío")
    .max(150, "El nombre no puede exceder los 150 caracteres")
    .optional(),
  departamentosIds: departamentosIdsValidation.optional(),
  departamentosGestionadosIds: departamentosIdsValidation.optional(),
});

export const carreraIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export type CreateCarreraDTO = z.infer<typeof createCarreraValidation>;
export type UpdateCarreraDTO = z.infer<typeof updateCarreraValidation>;
export type CarreraIdParamDTO = z.infer<typeof carreraIdParamValidation>;
