import { z } from "zod";

export const loginValidation = z.object({
  correo: z
    .string({ message: "El correo electrónico es obligatorio" })
    .trim()
    .email("El formato del correo electrónico no es válido"),
  clave: z
    .string({ message: "La contraseña es obligatoria" })
    .min(1, "La contraseña no puede estar vacía"),
});

export type LoginDTO = z.infer<typeof loginValidation>;
