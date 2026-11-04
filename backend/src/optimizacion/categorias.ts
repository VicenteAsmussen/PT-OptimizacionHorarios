import { comparar } from "./entrada.js";

export const FUENTE_EDIFICIOS = "Resumen Salas Institucionales UBB al 16.11.2022.xls, Salas_Institucionales, columnas A/B/H, filas 7–68. Edificios en filas 7/12/19/44/51/55/59, clasificación auditada.";
// Lista cerrada acreditada en la fuente institucional. No se interpretan sufijos.
const codigosPorEdificio: Record<string, readonly string[]> = {
  AA: ["A101AA", "A102AA", "A103AA", "A104AA"],
  AB: ["A101AB", "A102AB", "A201AB", "A202AB", "A301AB", "A302AB"],
  AC: ["A101AC", "A102AC", "A103AC", "A104AC", "A105AC", "A106AC", "A107AC", "A108AC",
    "A201AC", "A202AC", "A203AC", "A204AC", "A205AC", "A206AC", "A207AC", "A208AC",
    "A301AC", "A302AC", "A303AC", "A304AC", "A305AC", "A306AC", "A307AC", "A308AC"],
  AD: ["S201AD", "S202AD", "S203AD", "S301AD", "S302AD", "S303AD"],
  II: ["S101II", "S102II", "S103II"],
  ExIM: ["S101ExIM", "S102ExIM", "S103ExIM"],
  EG: ["A101EG", "S204EG", "S205EG", "S206EG", "S208EG", "S209EG", "S210EG", "S211EG", "S212EG", "S213EG"],
};
const edificios = new Map(Object.entries(codigosPorEdificio).flatMap(([edificio, codigos]) => codigos.map(codigo => [codigo, edificio] as const)));
export interface SalaParaCategorias { id: number; nombre: string; tipo: string; capacidad: number }
export interface CategoriaSalaPreparada {
  id: string;
  edificio: string;
  tipo: "Sala";
  capacidad: number;
  cantidadCatalogo: number;
  cantidadSugerida: number;
  salaIds: number[];
  fuente: string;
}
export function prepararCategoriasSalas(salas: readonly SalaParaCategorias[]): {
  categorias: CategoriaSalaPreparada[]; diagnosticos: { salaId: number; mensaje: string }[];
} {
  const categorias = new Map<string, CategoriaSalaPreparada>();
  const diagnosticos: { salaId: number; mensaje: string }[] = [];
  const ids = new Set<number>(), nombres = new Set<string>();
  for (const sala of [...salas].sort((a, b) => a.id - b.id)) {
    if (!Number.isSafeInteger(sala.id) || sala.id <= 0 || ids.has(sala.id) || nombres.has(sala.nombre)) throw new Error("Catálogo de salas con identidades inválidas o duplicadas.");
    ids.add(sala.id); nombres.add(sala.nombre);
    const edificio = edificios.get(sala.nombre);
    if (!edificio || sala.tipo !== "Sala" || !Number.isSafeInteger(sala.capacidad) || sala.capacidad <= 0) {
      diagnosticos.push({ salaId: sala.id, mensaje: "Sala sin clasificación acreditada o capacidad válida. Los laboratorios requieren declaración explícita de capacidad, cantidad y fuente por ejecución." });
      continue;
    }
    const id = `${edificio}-Sala-${sala.capacidad}`;
    const categoria = categorias.get(id) ?? { id, edificio, tipo: "Sala" as const, capacidad: sala.capacidad,
      cantidadCatalogo: 0, cantidadSugerida: 0, salaIds: [], fuente: FUENTE_EDIFICIOS };
    categoria.salaIds.push(sala.id); categoria.cantidadCatalogo++;
    categoria.cantidadSugerida = Math.ceil(categoria.cantidadCatalogo / 2);
    categorias.set(id, categoria);
  }
  return { categorias: [...categorias.values()].sort((a, b) => comparar(a.id, b.id)), diagnosticos };
}
