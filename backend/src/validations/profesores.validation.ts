import { z } from "zod";
import { normalizarRut } from "../utils/rut.js";

const rutValidation = z.string({ message: "El RUT del profesor es obligatorio" })
  .transform((valor, contexto) => {
    const rut = normalizarRut(valor);
    if (rut === null) {
      contexto.addIssue({ code: "custom", message: "El RUT del profesor no es válido" });
      return z.NEVER;
    }
    return rut;
  });

export const tiposProfesor = ["planta", "part time"] as const;

const profesorTipoValidation = z.enum(tiposProfesor, {
  message: "El tipo de profesor debe ser 'planta' o 'part time'",
});

export const profesorQueryValidation = z.object({
  departamentoId: z.coerce.number().int().positive().optional(),
});

export const accesoProfesorValidation = z.object({
  correo: z
    .string({ message: "El correo electrónico es obligatorio" })
    .trim()
    .email("El formato del correo electrónico no es válido")
    .max(254, "El correo no puede exceder los 254 caracteres"),
  clave: z
    .string({ message: "La contraseña inicial es obligatoria" })
    .min(6, "La contraseña inicial debe tener al menos 6 caracteres"),
});

export const updateAccesoProfesorValidation = accesoProfesorValidation.partial().refine(
  (data) => data.correo !== undefined || data.clave !== undefined,
  "Debe enviar correo o contraseña inicial para actualizar el acceso"
);

export const createProfesorValidation = z.object({
  rut: rutValidation,
  nombre: z
    .string({ message: "El nombre del profesor es obligatorio" })
    .trim()
    .min(1, "El nombre del profesor no puede estar vacío")
    .max(100, "El nombre no puede exceder los 100 caracteres"),
  departamentoId: z
    .number({ message: "El ID del departamento es obligatorio" })
    .int("El ID del departamento debe ser un número entero")
    .positive("El ID del departamento debe ser mayor a 0"),
  tipo: profesorTipoValidation,
  usuarioId: z
    .number({ message: "El ID de usuario debe ser numérico" })
    .int("El ID de usuario debe ser un número entero")
    .positive("El ID de usuario debe ser mayor a 0")
    .optional(),
  acceso: accesoProfesorValidation.optional(),
}).refine((data) => !(data.usuarioId && data.acceso), {
  message: "No se puede vincular usuario existente y crear acceso al mismo tiempo",
  path: ["acceso"],
});

export const updateProfesorValidation = z.object({
  rut: rutValidation.optional(),
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre del profesor no puede estar vacío")
    .max(100, "El nombre no puede exceder los 100 caracteres")
    .optional(),
  departamentoId: z
    .number()
    .int("El ID del departamento debe ser un número entero")
    .positive("El ID del departamento debe ser mayor a 0")
    .optional(),
  tipo: profesorTipoValidation.optional(),
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
export type AccesoProfesorDTO = z.infer<typeof accesoProfesorValidation>;
export type UpdateAccesoProfesorDTO = z.infer<typeof updateAccesoProfesorValidation>;
export type ProfesorIdParamDTO = z.infer<typeof profesorIdParamValidation>;
