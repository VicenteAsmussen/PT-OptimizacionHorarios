/** Límites del formulario docente, no cambian la política de autenticación. */
// Rechaza correos de acceso que exceden el tamaño admitido por el formulario.
export function validarCorreoAcceso(correo: string): void {
  if (correo.trim().length > 254) throw new Error("El correo no puede exceder los 254 caracteres.");
}

// Explica cuándo una contraseña supera el límite medido en bytes UTF-8.
export function errorClaveAcceso(clave: string): string {
  return new TextEncoder().encode(clave).length > 72
    ? "La contraseña no puede exceder los 72 bytes UTF-8. Algunos caracteres ocupan más de un byte."
    : "";
}

// Impide preparar un acceso con una contraseña fuera del límite de bytes.
export function validarClaveAcceso(clave: string): void {
  const error = errorClaveAcceso(clave);
  if (error) throw new Error(error);
}
