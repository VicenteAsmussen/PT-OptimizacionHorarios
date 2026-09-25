import { z } from "zod";

export const rolUsuarioEnum = ["secretaria", "profesor", "admin"] as const;

export const createUsuarioValidation = z
  .object({
    nombre: z
      .string({ message: "El nombre es obligatorio" })
      .trim()
      .min(1, "El nombre no puede estar vacío")
      .max(150, "El nombre no puede exceder los 150 caracteres"),
    correo: z
      .string({ message: "El correo electrónico es obligatorio" })
      .trim()
      .email("El formato del correo electrónico no es válido"),
    clave: z
      .string({ message: "La contraseña es obligatoria" })
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    rol: z.enum(rolUsuarioEnum, {
      message: "El rol debe ser 'secretaria', 'profesor' o 'admin'",
    }),
    carreraId: z
      .number({ message: "El ID de la carrera debe ser numérico" })
      .int("El ID de la carrera debe ser un número entero")
      .positive("El ID de la carrera debe ser positivo")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.rol === "secretaria" && !data.carreraId) {
        return false;
      }
      return true;
    },
    {
      message: "Para el rol 'secretaria' es obligatorio especificar una carrera vinculada (carreraId)",
      path: ["carreraId"],
    }
  );

export const updateUsuarioValidation = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(150, "El nombre no puede exceder los 150 caracteres")
    .optional(),
  correo: z
    .string()
    .trim()
    .email("El formato del correo electrónico no es válido")
    .optional(),
  clave: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .optional(),
  rol: z
    .enum(rolUsuarioEnum, {
      message: "El rol debe ser 'secretaria', 'profesor' o 'admin'",
    })
    .optional(),
  carreraId: z
    .number()
    .int("El ID de la carrera debe ser un número entero")
    .positive("El ID de la carrera debe ser positivo")
    .optional(),
});

export const usuarioIdParamValidation = z.object({
  id: z.coerce
    .number({ message: "El parámetro ID debe ser numérico" })
    .int("El ID debe ser un número entero")
    .positive("El ID debe ser mayor a 0"),
});

export type CreateUsuarioDTO = z.infer<typeof createUsuarioValidation>;
export type UpdateUsuarioDTO = z.infer<typeof updateUsuarioValidation>;
export type UsuarioIdParamDTO = z.infer<typeof usuarioIdParamValidation>;
