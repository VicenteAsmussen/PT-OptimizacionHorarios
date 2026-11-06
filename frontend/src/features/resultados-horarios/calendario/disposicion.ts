import { claveDia, ordenarBloques } from '../../disponibilidad/estado';
import { bloquesDestino, rangoBloque } from '../modelo';
import type { Bloque, SesionResultado } from '../types';

export const identidadSesion = (sesion: SesionResultado) => JSON.stringify([sesion.ofertaId, sesion.tipoHora.id, sesion.profesorId, sesion.idsHorarios]);

export function distribuirSesiones(bloques: Bloque[], sesiones: SesionResultado[]) {
  const ordenados = ordenarBloques(bloques);
  const franjas = [...new Set(ordenados.map(rangoBloque))].sort();
  const dias = [...new Map(ordenados.map(b => [claveDia(b.dia), b.dia])).entries()].map(([clave, nombre]) => {
    const finales: number[] = [];
    const tarjetas = sesiones.filter(s => claveDia(s.dia) === clave).map(sesion => {
      const filas = sesion.bloquesIds.map(id => bloques.find(b => b.id === id)).filter((b): b is Bloque => Boolean(b))
        .map(b => franjas.indexOf(rangoBloque(b))).sort((a, b) => a - b);
      return { sesion, inicio: filas[0] ?? 0, fin: (filas.at(-1) ?? 0) + 1 };
    }).sort((a, b) => a.inicio - b.inicio || b.fin - a.fin || identidadSesion(a.sesion).localeCompare(identidadSesion(b.sesion)))
      .map(tarjeta => {
        let carril = finales.findIndex(fin => fin <= tarjeta.inicio);
        if (carril < 0) carril = finales.length;
        finales[carril] = tarjeta.fin;
        return { ...tarjeta, carril };
      });
    return { clave, nombre, tarjetas, carriles: Math.max(1, finales.length) };
  });
  return { dias, franjas };
}

export function distribuirReservas(bloques: Bloque[], idsReservados: number[]) {
  const ordenados = ordenarBloques(bloques);
  const franjas = [...new Set(ordenados.map(rangoBloque))].sort();
  const reservas: { dia: string; inicio: number; fin: number; bloquesIds: number[] }[] = [];
  for (const bloque of ordenados.filter(b => idsReservados.includes(b.id))) {
    const fila = franjas.indexOf(rangoBloque(bloque));
    const anterior = reservas.at(-1);
    if (anterior?.dia === claveDia(bloque.dia) && anterior.fin === fila
      && bloquesDestino(bloques, anterior.bloquesIds[0], anterior.bloquesIds.length + 1).at(-1)?.id === bloque.id) {
      anterior.fin = fila + 1;
      anterior.bloquesIds.push(bloque.id);
    } else reservas.push({ dia: claveDia(bloque.dia), inicio: fila, fin: fila + 1, bloquesIds: [bloque.id] });
  }
  return reservas;
}

export function tramosSalas(sesion: SesionResultado, bloques: Bloque[]) {
  const tramos: { sala: string; inicio: string; fin: string }[] = [];
  sesion.bloquesIds.forEach((id, indice) => {
    const bloque = bloques.find(b => b.id === id);
    if (!bloque) return;
    const sala = sesion.salas[indice]?.nombre ?? 'Sin sala';
    const anterior = tramos.at(-1);
    if (anterior && anterior.sala === sala) anterior.fin = bloque.horaTermino.slice(0, 5);
    else tramos.push({ sala, inicio: bloque.horaInicio.slice(0, 5), fin: bloque.horaTermino.slice(0, 5) });
  });
  return tramos.map(t => `${t.inicio}–${t.fin}: ${t.sala}`);
}
