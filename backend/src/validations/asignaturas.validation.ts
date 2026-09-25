import { z } from "zod";

export const tipoHoraAsignaturaInputValidation = z.object({
  tipoHoraId: z
    .number({ message: "El ID del tipo de hora debe ser numérico" })
    .int("El ID del tipo de hora debe ser un número entero")
    .positive("El ID del tipo de hora debe ser positivo"),
  horas: z
    .number({ message: "La cantidad de horas debe ser numérica" })
    .int("La cantidad de horas debe ser un número entero")
    .nonnegative("La cantidad de horas no puede ser negativa"),
});

export const createAsignaturaValidation = z.object({
  codigo: z
    .string({ message: "El código de la asignatura es obligatorio" })
    .trim()
    .min(1, "El código de la asignatura no puede estar vacío")
    .max(20, "El código no puede exceder los 20 caracteres"),
  nombre: z
    .string({ message: "El nombre de la asignatura es obligatorio" })
    .trim()
    .min(1, "El nombre de la asignatura no puede estar vacío"),
  semestreMalla: z
    .number({ message: "El semestre de la malla es obligatorio" })
    .int("El semestre de la malla debe ser un número entero")
    .min(1, "El semestre de la malla debe ser como mínimo 1")
    .max(14, "El semestre de la malla debe ser como máximo 14"),
  esCritica: z.boolean({ message: "El campo esCrítica debe ser un booleano" }).optional().default(false),
  tiposHora: z.array(tipoHoraAsignaturaInputValidation).optional().default([]),
  carrerasIds: z.array(z.number().int().positive("Los IDs de carreras deben ser números positivos")).optional().default([]),
});

export const updateAsignaturaValidation = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la asignatura no puede estar vacío")
    .optional(),
  semestreMalla: z
    .number()
    .int("El semestre de la malla debe ser un número entero")
    .min(1, "El semestre de la malla debe ser como mínimo 1")
    .max(14, "El semestre de la malla debe ser como máximo 14")
    .optional(),
  esCritica: z.boolean().optional(),
  tiposHora: z.array(tipoHoraAsignaturaInputValidation).optional(),
  carrerasIds: z.array(z.number().int().positive("Los IDs de carreras deben ser números positivos")).optional(),
});

export const asignaturaCodigoParamValidation = z.object({
  codigo: z
    .string({ message: "El parámetro código es obligatorio" })
    .trim()
    .min(1, "El código no puede estar vacío")
    .max(20, "El código no puede exceder los 20 caracteres"),
});

export type CreateAsignaturaDTO = z.infer<typeof createAsignaturaValidation>;
export type UpdateAsignaturaDTO = z.infer<typeof updateAsignaturaValidation>;
export type AsignaturaCodigoParamDTO = z.infer<typeof asignaturaCodigoParamValidation>;
export type TipoHoraAsignaturaInput = z.infer<typeof tipoHoraAsignaturaInputValidation>;
