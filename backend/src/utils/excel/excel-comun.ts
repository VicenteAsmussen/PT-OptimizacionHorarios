import { normalizarTextoCelda } from "./excel-salas.js";

export function normalizarNombreExcel(valor: string): string {
  return normalizarTextoCelda(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normalizarTipoHoraExcel(valor: string): string {
  const texto = normalizarNombreExcel(valor);
  if (["teorica", "teorico", "teoria", "teo", "t"].includes(texto)) return "teorica";
  if (["practica", "practico", "pract", "pra", "p"].includes(texto)) return "practica";
  if (["laboratorio", "laboratory", "lab", "l"].includes(texto)) return "laboratorio";
  return texto;
}
