import { normalizarTextoCelda } from "./excel-salas.js";

// Unifica texto académico del intercambio para comparar nombres sin distinguir acentos o mayúsculas.
export function normalizarNombreExcel(valor: string): string {
  return normalizarTextoCelda(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Reconoce las variantes de teoría, práctica y laboratorio utilizadas en los archivos.
export function normalizarTipoHoraExcel(valor: string): string {
  const texto = normalizarNombreExcel(valor);
  if (["teorica", "teorico", "teoria", "teo", "t"].includes(texto)) return "teorica";
  if (["practica", "practico", "pract", "pra", "p"].includes(texto)) return "practica";
  if (["laboratorio", "laboratory", "lab", "l"].includes(texto)) return "laboratorio";
  return texto;
}
