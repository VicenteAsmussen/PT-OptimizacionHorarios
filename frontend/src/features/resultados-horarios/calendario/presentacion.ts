import type { SesionResultado } from '../types';

export function nombreCompacto(nombre: string) {
  const palabras = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
  return palabras.map(palabra => /^(?:\d+|I{1,3}|IV|V|VI{1,3}|IX|X)$/.test(palabra) ? palabra : palabra[0])
    .join('').toLocaleUpperCase('es');
}

function partesCompactas(sesion: SesionResultado, sala: string) {
  const tipo = sesion.tipoHora.tipo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tipos: Record<string, string> = { teorica: 'Teo.', teoria: 'Teo.', practica: 'Prác.', laboratorio: 'Lab.' };
  const estados: Record<string, string> = { externa: 'H. ext.', pendiente: 'Pend. sala', noRequiere: 'No requiere', laboratorio: 'Lab.' };
  const estado = sesion.estadoSala === 'asignada' ? sala : estados[sesion.estadoSala] ?? sala;
  return [`Sec. ${sesion.seccion} · ${tipos[tipo] ?? sesion.tipoHora.tipo}`, estado];
}

export function resumenCompacto(sesion: SesionResultado, sala: string) {
  return partesCompactas(sesion, sala).join(' · ');
}

export function lineasCompactas(sesion: SesionResultado, sala: string) {
  return partesCompactas(sesion, sala);
}
