import { useState, type CSSProperties } from 'react';
import { abreviarTipoClase, describirClase } from './modelo';
import { crearCalendarioSesiones, horarioSesion } from './sesiones';
import type { Bloque, ClaseHorario } from './types';
import DetalleClaseDialogo from './DetalleClaseDialogo';
import MarcadorReserva from './MarcadorReserva';
import estilos from './MiHorario.module.css';

interface Propiedades {
  bloques: Bloque[];
  horarios: ClaseHorario[];
  planificacionId: number;
  bloquesReservadosIds?: number[];
}

export default function CalendarioSemanal({ bloques, horarios, planificacionId, bloquesReservadosIds = [] }: Propiedades) {
  const [claseId, setClaseId] = useState<number | null>(null);
  const calendario = crearCalendarioSesiones(bloques, horarios, planificacionId, bloquesReservadosIds);
  const seleccionada = calendario.filas.flatMap(fila => fila.celdas.filter(celda => !celda.continuacion)
    .flatMap(celda => celda.sesiones)).find(sesion => sesion.clase.id === claseId);
  return <>
    <div className={`${estilos.desplazamiento} ${estilos.consulta}`} tabIndex={0} role="region" aria-label="Calendario semanal de clases">
    <table className={estilos.calendario} aria-label="Horario semanal">
      <thead><tr><th scope="col">Horario</th>{calendario.dias.map(dia => <th key={dia.clave} scope="col">{dia.nombre}</th>)}</tr></thead>
      <tbody>{calendario.filas.map(fila => <tr key={fila.horario}>
        <th scope="row">{fila.horario}</th>
        {fila.celdas.map((celda, indice) => celda.continuacion ? null : <td key={calendario.dias[indice].clave}
          className={celda.filas > 1 ? celda.sesiones.length > 0 ? estilos.celdaSesion : estilos.celdaReserva : undefined}
          rowSpan={celda.filas > 1 ? celda.filas : undefined}>
          <div className={estilos.contenidoCelda}>
          {celda.bloque && bloquesReservadosIds.includes(celda.bloque.id) && <MarcadorReserva conClase={celda.clases.length > 0} />}
          {celda.bloque ? <>
            {celda.sesiones.map(({ clase, bloques: bloquesSesion }) => {
              const detalle = describirClase(clase);
              return <button key={clase.id} type="button" className={`${estilos.clase} ${bloquesSesion.length > 1 ? estilos.sesionAgrupada : ''}`}
                style={bloquesSesion.length > 1 ? { '--filas-sesion': bloquesSesion.length } as CSSProperties : undefined}
                aria-label={`${detalle.asignatura}, ${detalle.seccion}, ${detalle.tipo}, ${bloquesSesion[0].dia}, ${horarioSesion(bloquesSesion)}, ${detalle.sala}`} aria-haspopup="dialog"
                onClick={() => setClaseId(clase.id)}>
                <span className={estilos.lineaClase}>
                  <strong title={detalle.asignatura}>{detalle.asignatura}</strong>
                </span>
                <span className={estilos.lineaClase}>
                  <span>sec {clase.oferta.seccion}</span><span aria-hidden="true">·</span>
                  <span title={detalle.tipo}>{abreviarTipoClase(detalle.tipo)}</span>
                </span>
                <span className={estilos.salaHorario}>
                  <span className={estilos.salaClase}>{detalle.sala}</span>
                  <span aria-hidden="true">·</span>
                  <span className={estilos.horasSesion}>{horarioSesion(bloquesSesion)}</span>
                </span>
              </button>;
            })}
          </> : <span aria-label="Sin bloque">—</span>}
        </div></td>)}
      </tr>)}</tbody>
    </table>
    </div>
    {seleccionada && <DetalleClaseDialogo key={`${planificacionId}-${seleccionada.clase.id}`}
      clase={seleccionada.clase} bloque={seleccionada.bloques[0]} bloquesSesion={seleccionada.bloques} cerrar={() => setClaseId(null)} />}
  </>;
}
