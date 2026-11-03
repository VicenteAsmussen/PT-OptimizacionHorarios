import { claveDia, ordenarBloques } from '../disponibilidad/estado';
import { abreviarTipoClase, inicialesAsignatura } from '../mi-horario/modelo';
import { bloquesDestino, estadoCasilla, estadoDestino, etiquetasSala, etiquetaSesion, esSesionLista, puedeMoverSesion, rangoBloque, sesionesVisibles } from './modelo';
import type { ResultadoHorario, SesionResultado } from './types';
import calendario from '../mi-horario/MiHorario.module.css';
import estilos from './ResultadosHorarios.module.css';

interface Propiedades {
  resultado: ResultadoHorario; nivel: string; seleccionar: (sesion: SesionResultado) => void; ocupado?: boolean;
  movimiento?: { sesion: SesionResultado; idsHorarios: number[]; cantidad: number; inicioId: number; invalido: boolean; elegir: (id: number) => void };
}
export default function CalendarioResultados({ resultado, nivel, seleccionar, ocupado, movimiento }: Propiedades) {
  const bloques = ordenarBloques(resultado.bloques);
  const dias = [...new Map(bloques.map(b => [claveDia(b.dia), b.dia])).entries()];
  const franjas = [...new Set(bloques.map(rangoBloque))].sort();
  const sesiones = sesionesVisibles(resultado, nivel);
  const destinos = movimiento ? bloquesDestino(bloques, movimiento.inicioId, movimiento.cantidad).map(b => b.id) : [];
  const mostrarPrevia = movimiento && !movimiento.invalido
    && sesiones.some(s => s.idsHorarios[0] === movimiento.sesion.idsHorarios[0])
    && estadoDestino(resultado, movimiento.sesion, movimiento.inicioId, movimiento.cantidad) === 'disponible';
  return <div className={calendario.desplazamiento} tabIndex={0} role="region" aria-label="Calendario semanal de la carrera">
    <table className={`${calendario.calendario} ${estilos.tablaResultados}`} style={{ minWidth: `${8 + dias.length * 10}rem` }} aria-label="Horario semanal">
      <colgroup><col className={estilos.columnaHora} />{dias.map(([clave]) => <col key={clave} />)}</colgroup>
      <thead><tr><th scope="col">Horario</th>{dias.map(([clave, dia]) => <th key={clave} scope="col">{dia}</th>)}</tr></thead>
      <tbody>{franjas.map(franja => <tr key={franja}><th scope="row">{franja}</th>
        {dias.map(([dia]) => {
          const bloque = bloques.find(b => claveDia(b.dia) === dia && rangoBloque(b) === franja);
          const estado = bloque && movimiento ? estadoCasilla(resultado, movimiento.sesion, bloque.id) : null;
          const estadoInicio = bloque && movimiento ? estadoDestino(resultado, movimiento.sesion, bloque.id, movimiento.cantidad) : null;
          const disponible = estado === 'disponible';
          const destino = bloque && destinos.includes(bloque.id);
          return <td key={dia} className={movimiento ? `${estilos.celdaMovimiento} ${destino && movimiento.invalido ? estilos.invalido : disponible ? estilos.disponible : estilos.sinDisponibilidad} ${destino ? estilos.destinoSeleccionado : ''}` : undefined}>
            {bloque && movimiento && <button type="button" className={estilos.destino} disabled={ocupado || estadoInicio !== 'disponible'}
              aria-pressed={bloque.id === movimiento.inicioId} onClick={() => { if (!ocupado && estadoInicio === 'disponible') movimiento.elegir(bloque.id); }}
              aria-label={`${bloque.dia} ${rangoBloque(bloque)}: ${disponible ? 'libre con disponibilidad' : estado === 'ocupado' ? 'ocupado' : 'sin disponibilidad'}${estadoInicio === 'inicioPar' ? '; inicio impar requerido' : estadoInicio === 'fueraDeRango' ? '; sin espacio para todo el grupo' : ''}`} />}
            <div className={calendario.contenidoCelda}>{bloque ? sesiones.filter(s => s.bloquesIds.includes(bloque.id)).map(sesion => {
              const seleccionada = movimiento?.sesion.idsHorarios[0] === sesion.idsHorarios[0]
                && movimiento.idsHorarios.includes(sesion.idsHorarios[sesion.bloquesIds.indexOf(bloque.id)]);
              return <button key={`${sesion.ofertaId}-${sesion.idsHorarios[0]}`} type="button" disabled={ocupado || !puedeMoverSesion(resultado, sesion)}
                className={`${calendario.clase} ${esSesionLista(sesion) ? estilos.sesionLista : estilos.sesionPendiente} ${movimiento ? estilos.tarjetaOcupada : ''} ${seleccionada ? estilos.seleccionada : ''}`}
                aria-pressed={seleccionada} aria-controls="controles-movimiento"
                aria-label={`${etiquetaSesion(sesion)}, ${sesion.profesor.nombre}, ${etiquetasSala[sesion.estadoSala]}`}
                onClick={() => { if (!ocupado && puedeMoverSesion(resultado, sesion)) seleccionar(sesion); }}>
                <span className={calendario.lineaClase}><strong title={sesion.asignatura.nombre}>{inicialesAsignatura(sesion.asignatura.nombre)}</strong>
                  <span>sec {sesion.seccion} · {abreviarTipoClase(sesion.tipoHora.tipo)}</span></span>
                <span className={calendario.lineaClase} title={etiquetasSala[sesion.estadoSala]}>
                  <span>{sesion.estadoSala === 'asignada' ? [...new Set(sesion.salas.map(s => s?.nombre ?? 'sin sala'))].join(', ') : etiquetasSala[sesion.estadoSala]}</span>
                </span>
              </button>;
            }) : <span aria-label="Sin bloque">—</span>}
              {destino && mostrarPrevia && <div className={`${calendario.clase} ${estilos.vistaPrevia}`} role="note"
                data-bloque-id={bloque.id} aria-label={`Vista previa sin guardar: ${etiquetaSesion(movimiento.sesion)}, ${movimiento.sesion.profesor.nombre}`}>
                <span className={calendario.lineaClase}><strong title={movimiento.sesion.asignatura.nombre}>{inicialesAsignatura(movimiento.sesion.asignatura.nombre)}</strong>
                  <span>sec {movimiento.sesion.seccion} · {abreviarTipoClase(movimiento.sesion.tipoHora.tipo)}</span></span>
                <span className={calendario.lineaClase}>Vista previa · Sin guardar</span>
              </div>}
            </div>
          </td>;
        })}</tr>)}</tbody>
    </table>
  </div>;
}
