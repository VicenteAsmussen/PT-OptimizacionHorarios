import { useEffect, useRef } from 'react';
import { claveDia, ordenarBloques } from './estado';
import { obtenerPareja, parejaUtilizable } from './parejas';
import type { Bloque } from './types';
import estilos from './Disponibilidad.module.css';

interface Propiedades {
  bloques: Bloque[];
  bloquesIds: number[];
  bloquesReservadosIds?: number[];
  bloqueada: boolean;
  guardada: boolean;
  alternar: (id: number) => void;
}

export default function GrillaDisponibilidad({ bloques, bloquesIds, bloquesReservadosIds = [], bloqueada, guardada, alternar }: Propiedades) {
  const arrastre = useRef<{ punteroId: number; marcar: boolean; visitados: Set<number> } | null>(null);
  const omitirClick = useRef(false);
  useEffect(() => {
    arrastre.current = null;
    const terminar = () => { arrastre.current = null; };
    const soltar = (evento: PointerEvent) => {
      if (evento.pointerId === arrastre.current?.punteroId) terminar();
    };
    window.addEventListener('pointerup', soltar, true);
    window.addEventListener('pointercancel', soltar, true);
    window.addEventListener('blur', terminar);
    return () => {
      terminar();
      window.removeEventListener('pointerup', soltar, true);
      window.removeEventListener('pointercancel', soltar, true);
      window.removeEventListener('blur', terminar);
    };
  }, [bloqueada, guardada, bloques]);

  function pintar(id: number) {
    const gesto = arrastre.current;
    if (!gesto || bloqueada || !parejaUtilizable(bloques, id, bloquesReservadosIds) || gesto.visitados.has(id)) return;
    for (const bloque of obtenerPareja(bloques, id)) {
      gesto.visitados.add(bloque.id);
      if (bloquesIds.includes(bloque.id) !== gesto.marcar) alternar(bloque.id);
    }
  }

  const ordenados = ordenarBloques(bloques);
  const dias = [...new Map(ordenados.map(b => [claveDia(b.dia), b.dia])).entries()];
  const numeros = [...new Set(ordenados.map(b => b.numeroBloque))].sort((a, b) => a - b);
  return <div className={estilos.desplazamiento} tabIndex={0} role="region" aria-label="Planilla de disponibilidad por día y bloque">
    <table className={estilos.grilla} aria-label="Disponibilidad semanal">
      <thead><tr><th scope="col">Horario</th>{dias.map(([clave, dia]) => <th key={clave} scope="col">{dia}</th>)}</tr></thead>
      <tbody>{numeros.map(numero => {
        const bloquesFila = ordenados.filter(b => b.numeroBloque === numero);
        const horarios = new Set(bloquesFila.map(b => `${b.horaInicio.slice(0, 5)}–${b.horaTermino.slice(0, 5)}`));
        const horarioComun = horarios.size === 1 ? [...horarios][0] : null;
        return <tr key={numero}>
        <th scope="row">{[...horarios].map(horario => <span key={horario} className={estilos.horarioFila}>{horario}</span>)}</th>
        {dias.map(([clave]) => {
          const bloque = ordenados.find(b => claveDia(b.dia) === clave && b.numeroBloque === numero);
          if (!bloque) return <td key={clave}>—</td>;
          const marcado = bloquesIds.includes(bloque.id);
          const reservado = bloquesReservadosIds.includes(bloque.id);
          const pareja = obtenerPareja(bloques, bloque.id);
          const utilizable = parejaUtilizable(bloques, bloque.id, bloquesReservadosIds);
          const parejaMarcada = pareja.length === 2 && pareja.every(actual => bloquesIds.includes(actual.id));
          const horario = `${bloque.horaInicio.slice(0, 5)}–${bloque.horaTermino.slice(0, 5)}`;
          return <td key={clave}><button type="button" aria-pressed={marcado} disabled={bloqueada || !utilizable}
            aria-label={`${bloque.dia}, bloque ${numero}, ${horario}${reservado ? `, reservado para esta carrera${marcado ? ', disponibilidad anterior' : ''}`
              : !utilizable ? ', pareja no disponible' : `, selecciona la pareja ${pareja[0].numeroBloque} y ${pareja[1].numeroBloque}`}`}
            className={`${estilos.bloque} ${reservado ? estilos.reservado : marcado ? guardada ? estilos.guardado : estilos.marcado : ''}`}
            onPointerDown={evento => {
              omitirClick.current = false;
              arrastre.current = null;
              if (evento.pointerType !== 'mouse' || evento.button !== 0 || bloqueada || !utilizable) return;
              omitirClick.current = true;
              arrastre.current = { punteroId: evento.pointerId, marcar: !parejaMarcada, visitados: new Set() };
              pintar(bloque.id);
            }}
            onPointerEnter={evento => {
              if (evento.pointerType !== 'mouse' || evento.pointerId !== arrastre.current?.punteroId) return;
              if ((evento.buttons & 1) === 0) { arrastre.current = null; return; }
              pintar(bloque.id);
            }}
            onClick={evento => {
              const omitir = omitirClick.current && evento?.detail > 0;
              omitirClick.current = false;
              if (!omitir && !bloqueada && utilizable) {
                for (const actual of pareja) {
                  if (bloquesIds.includes(actual.id) === parejaMarcada) alternar(actual.id);
                }
              }
            }}>
            {reservado ? <span>Reservado</span> : !horarioComun && <span>{horario}</span>}
          </button></td>;
        })}
      </tr>; })}</tbody>
    </table>
  </div>;
}
