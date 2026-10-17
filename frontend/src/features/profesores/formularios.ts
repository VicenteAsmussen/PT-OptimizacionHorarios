import type { CambiosAccesoProfesor } from "./types";
// @ts-expect-error La extensión permite ejecutar las pruebas nativas de Node; Vite resuelve este módulo sin emitir TypeScript.
import { validarClaveAcceso, validarCorreoAcceso } from "./limites.ts";

export function prepararNuevoAcceso(correo: string, clave: string): { correo: string; clave: string } {
  validarCorreoAcceso(correo);
  validarClaveAcceso(clave);
  return { correo: correo.trim(), clave };
}

export function prepararCambiosAcceso(
  correo: string, clave: string, correoAnterior: string,
): CambiosAccesoProfesor | null {
  validarCorreoAcceso(correo);
  validarClaveAcceso(clave);
  const correoNuevo = correo.trim();
  if (correoNuevo && correoNuevo !== correoAnterior) {
    return clave ? { correo: correoNuevo, clave } : { correo: correoNuevo };
  }
  return clave ? { clave } : null;
}
