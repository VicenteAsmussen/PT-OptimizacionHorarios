/** Acepta cuerpos no nulos de 1–8 dígitos, con puntos convencionales y guion opcional. */
export function normalizarRut(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const entrada = valor.trim();
  if (!/^(?:\d{1,8}|\d{1,3}(?:\.\d{3}){1,2})-?[\dKk]$/.test(entrada)) return null;

  const compacto = entrada.replaceAll(".", "").replace("-", "").toUpperCase();
  const cuerpoOriginal = compacto.slice(0, -1);
  if (cuerpoOriginal.length > 8) return null;
  const cuerpo = cuerpoOriginal.replace(/^0+/, "");
  if (!cuerpo) return null;
  let suma = 0;
  let multiplicador = 2;
  for (let indice = cuerpo.length - 1; indice >= 0; indice--) {
    suma += Number(cuerpo[indice]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  const digito = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return compacto.at(-1) === digito ? `${cuerpo}-${digito}` : null;
}
