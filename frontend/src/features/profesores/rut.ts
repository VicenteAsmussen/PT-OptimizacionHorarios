import type { DatosProfesor } from "./types";

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

/** Presentación defensiva: no inventa un RUT si falta o llega un valor inesperado. */
export function formatearRut(valor: string | null | undefined): string {
  const entrada = valor?.trim() ?? "";
  if (!entrada) return "Sin RUT";
  const rut = normalizarRut(entrada);
  if (!rut) return entrada;
  const [cuerpo, digito] = rut.split("-");
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${digito}`;
}

// Proyección explícita compartida por creación y edición; no reenvía otros campos.
export function prepararDatosProfesor(datos: DatosProfesor): DatosProfesor {
  if (!datos.nombre.trim()) throw new Error("Ingresa el nombre del profesor.");
  const entrada = datos.rut.trim();
  const mensajeRut = "Ingresa un RUT válido con guion obligatorio y máximo 12 caracteres, por ejemplo 12.345.678-5.";
  if (entrada.length > 12 || !entrada.includes("-")) throw new Error(mensajeRut);
  const rut = normalizarRut(entrada);
  if (!rut) throw new Error(mensajeRut);
  return { rut, nombre: datos.nombre.trim(), departamentoId: datos.departamentoId, tipo: datos.tipo };
}
