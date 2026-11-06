import { claveDia } from './estado';
import type { Bloque } from './types';

export function obtenerPareja(bloques: Bloque[], id: number) {
  const bloque = bloques.find(actual => actual.id === id);
  if (!bloque) return [];
  const primero = bloque.numeroBloque % 2 === 0 ? bloque.numeroBloque - 1 : bloque.numeroBloque;
  const pareja = bloques.filter(actual => claveDia(actual.dia) === claveDia(bloque.dia)
    && (actual.numeroBloque === primero || actual.numeroBloque === primero + 1));
  return pareja.length === 2 && new Set(pareja.map(actual => actual.numeroBloque)).size === 2
    ? pareja.sort((a, b) => a.numeroBloque - b.numeroBloque) : [];
}

export function parejaUtilizable(bloques: Bloque[], id: number, reservados: number[]) {
  const pareja = obtenerPareja(bloques, id);
  return pareja.length === 2 && pareja.every(bloque => !reservados.includes(bloque.id));
}
