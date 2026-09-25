import { z } from "zod";

export const createDepartamentoValidation = z.object({
  nombre: z
    .string({ message: "El nombre del departamento es obligatorio" })
    .trim()
    .min(1, "El nombre del departamento no puede estar vacío")
    .max(150, "El nombre no puede exceder los 150 caracteres"),
});

export const updateDepartamentoValidation = z.object({
  nombre: z
    .string({ message: "El nombre del departamento es obligatorio" })
    .trim()
    .min(1, "El nombre del departamento no puede estar vacío")
    .max(150, "El nombre no puede exceder los 150 caracteres"),
});

export const departamentoIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export type CreateDepartamentoDTO = z.infer<typeof createDepartamentoValidation>;
export type UpdateDepartamentoDTO = z.infer<typeof updateDepartamentoValidation>;
export type DepartamentoIdParamDTO = z.infer<typeof departamentoIdParamValidation>;
