import { BadRequestError } from "./errors.js";

type AsignaturaCobertura = { codigo: string; nombre: string; semestreMalla: number };
export type CoberturaExterna = AsignaturaCobertura & {
  obligatorio: boolean;
  secciones: number[];
  estado: "cargada" | "faltante_obligatoria" | "faltante_opcional" | "invalida";
};

export function esObligatoriaExterna(semestreMalla: number, codigoPeriodo: string): boolean {
  if (!/^\d{4}-[12]$/.test(codigoPeriodo)) throw new BadRequestError("El período de la planificación no es válido.");
  return semestreMalla % 2 === Number(codigoPeriodo.slice(-1)) % 2;
}

export function calcularCoberturaExterna(
  asignaturas: AsignaturaCobertura[], codigoPeriodo: string,
  filas: { asignaturaCodigo: string; seccion: number }[], invalidas: Set<string> = new Set(),
): CoberturaExterna[] {
  return asignaturas.map<CoberturaExterna>(({ codigo, nombre, semestreMalla }) => {
    const obligatorio = esObligatoriaExterna(semestreMalla, codigoPeriodo);
    const secciones = [...new Set(filas.filter(fila => fila.asignaturaCodigo === codigo).map(fila => fila.seccion))].sort((a, b) => a - b);
    return { codigo, nombre, semestreMalla, obligatorio, secciones,
      estado: invalidas.has(codigo) ? "invalida" : secciones.length ? "cargada" : obligatorio ? "faltante_obligatoria" : "faltante_opcional" };
  }).sort((a, b) => a.semestreMalla - b.semestreMalla || a.codigo.localeCompare(b.codigo));
}
