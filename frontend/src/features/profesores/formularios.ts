import type { CambiosAccesoProfesor } from "./types";

export function prepararCambiosAcceso(
  correo: string, clave: string, correoAnterior: string,
): CambiosAccesoProfesor | null {
  const correoNuevo = correo.trim();
  if (correoNuevo && correoNuevo !== correoAnterior) {
    return clave ? { correo: correoNuevo, clave } : { correo: correoNuevo };
  }
  return clave ? { clave } : null;
}
