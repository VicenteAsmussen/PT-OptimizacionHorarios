/** Límites del formulario de profesores; no modifican la política de autenticación. */
export function validarCorreoAcceso(correo: string): void {
  if (correo.trim().length > 254) throw new Error("El correo no puede exceder los 254 caracteres.");
}

export function errorClaveAcceso(clave: string): string {
  return new TextEncoder().encode(clave).length > 72
    ? "La contraseña no puede exceder los 72 bytes UTF-8. Algunos caracteres ocupan más de un byte."
    : "";
}

export function validarClaveAcceso(clave: string): void {
  const error = errorClaveAcceso(clave);
  if (error) throw new Error(error);
}
