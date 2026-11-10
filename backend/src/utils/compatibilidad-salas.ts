import { normalizarTipoHoraExcel } from "./excel/excel-comun.js";

export const mensajeSalaIncompatible = "El tipo de sala no es compatible: las sesiones teóricas y prácticas requieren Sala; las de laboratorio requieren Laboratorio.";

export function esSalaCompatible(tipoHora: string, tipoSala: string): boolean {
  const tipo = normalizarTipoHoraExcel(tipoHora);
  if (tipo === "teorica" || tipo === "practica") return tipoSala === "Sala";
  return tipo === "laboratorio" && tipoSala === "Laboratorio";
}
