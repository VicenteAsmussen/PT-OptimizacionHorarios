import { useState } from 'react';
import { abreviarTipoClase, crearCalendario, describirClase, inicialesAsignatura } from './modelo';
import type { Bloque, ClaseHorario } from './types';
import DetalleClaseDialogo from './DetalleClaseDialogo';
import estilos from './MiHorario.module.css';

interface Propiedades {
  bloques: Bloque[];
  horarios: ClaseHorario[];
  planificacionId: number;
}

export default function CalendarioSemanal({ bloques, horarios, planificacionId }: Propiedades) {
  const [claseId, setClaseId] = useState<number | null>(null);
  const calendario = crearCalendario(bloques, horarios, planificacionId);
  const seleccionada = horarios.find(clase => clase.id === claseId && clase.planificacionSemestreId === planificacionId);
  const bloqueSeleccionado = bloques.find(bloque => bloque.id === seleccionada?.bloqueId);
  return <>
    <div className={estilos.desplazamiento} tabIndex={0} role="region" aria-label="Calendario semanal de clases">
    <table className={estilos.calendario} aria-label="Horario semanal">
      <thead><tr><th scope="col">Horario</th>{calendario.dias.map(dia => <th key={dia.clave} scope="col">{dia.nombre}</th>)}</tr></thead>
      <tbody>{calendario.filas.map(fila => <tr key={fila.horario}>
        <th scope="row">{fila.horario}</th>
        {fila.celdas.map((celda, indice) => <td key={calendario.dias[indice].clave}><div className={estilos.contenidoCelda}>
          {celda.bloque ? <>
            {celda.clases.map(clase => {
              const detalle = describirClase(clase);
              return <button key={clase.id} type="button" className={estilos.clase}
                aria-label={`${detalle.asignatura}, ${detalle.seccion}, ${detalle.tipo}`} aria-haspopup="dialog"
                onClick={() => setClaseId(clase.id)}>
                <span className={estilos.lineaClase}>
                  <strong title={detalle.asignatura}>{inicialesAsignatura(detalle.asignatura)}</strong>
                  <span aria-hidden="true">·</span><span>sec {clase.oferta.seccion}</span>
                </span>
                <span className={estilos.lineaClase}>
                  <span title={detalle.tipo}>{abreviarTipoClase(detalle.tipo)}</span>
                  <span aria-hidden="true">·</span><span>{detalle.sala}</span>
                </span>
              </button>;
            })}
          </> : <span aria-label="Sin bloque">—</span>}
        </div></td>)}
      </tr>)}</tbody>
    </table>
    </div>
    {seleccionada && bloqueSeleccionado && <DetalleClaseDialogo key={`${planificacionId}-${seleccionada.id}`}
      clase={seleccionada} bloque={bloqueSeleccionado} cerrar={() => setClaseId(null)} />}
  </>;
}
