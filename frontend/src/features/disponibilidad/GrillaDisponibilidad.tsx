import { claveDia, ordenarBloques } from './estado';
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
  const ordenados = ordenarBloques(bloques);
  const dias = [...new Map(ordenados.map(b => [claveDia(b.dia), b.dia])).entries()];
  const numeros = [...new Set(ordenados.map(b => b.numeroBloque))].sort((a, b) => a - b);
  return <div className={estilos.desplazamiento} tabIndex={0} role="region" aria-label="Planilla de disponibilidad por día y bloque">
    <table className={estilos.grilla} aria-label="Disponibilidad semanal">
      <thead><tr><th scope="col">Bloque</th>{dias.map(([clave, dia]) => <th key={clave} scope="col">{dia}</th>)}</tr></thead>
      <tbody>{numeros.map(numero => <tr key={numero}>
        <th scope="row">{numero}</th>
        {dias.map(([clave]) => {
          const bloque = ordenados.find(b => claveDia(b.dia) === clave && b.numeroBloque === numero);
          if (!bloque) return <td key={clave}>—</td>;
          const marcado = bloquesIds.includes(bloque.id);
          const reservado = bloquesReservadosIds.includes(bloque.id);
          const horario = `${bloque.horaInicio.slice(0, 5)}–${bloque.horaTermino.slice(0, 5)}`;
          return <td key={clave}><button type="button" aria-pressed={marcado} disabled={bloqueada || reservado}
            aria-label={`${bloque.dia}, bloque ${numero}, ${horario}${reservado ? `, reservado para esta carrera${marcado ? ', disponibilidad anterior' : ''}` : ''}`}
            className={`${estilos.bloque} ${reservado ? estilos.reservado : marcado ? guardada ? estilos.guardado : estilos.marcado : ''}`}
            onClick={() => { if (!bloqueada && !reservado) alternar(bloque.id); }}>
            <span>{reservado ? 'Reservado' : horario}</span>
          </button></td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
