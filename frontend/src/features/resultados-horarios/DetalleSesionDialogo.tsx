import Dialogo from './Dialogo';
import { etiquetasSala } from './modelo';
import { tramosSalas } from './calendario/disposicion';
import type { ResultadoHorario, SesionResultado } from './types';
import estilos from './ResultadosHorarios.module.css';

export default function DetalleSesionDialogo({ resultado, sesion, cerrar }: {
  resultado: ResultadoHorario; sesion: SesionResultado; cerrar: () => void;
}) {
  return <Dialogo titulo="Detalle de la sesión" tamano="detalle" ocupado={false} cerrar={cerrar}>
    <div className={estilos.detalleSesion}>
      <p><strong>{sesion.asignatura.codigo} — {sesion.asignatura.nombre}</strong></p>
      <dl>
        <div><dt>Sección</dt><dd>{sesion.seccion}</dd></div>
        <div><dt>Semestre de la malla</dt><dd>{sesion.asignatura.semestreMalla}</dd></div>
        <div><dt>Profesor</dt><dd>{sesion.profesor.nombre}</dd></div>
        <div><dt>Tipo de clase</dt><dd>{sesion.tipoHora.tipo}</dd></div>
        <div><dt>Día</dt><dd>{sesion.dia}</dd></div>
        <div><dt>Horario</dt><dd>{sesion.horaInicio.slice(0, 5)}–{sesion.horaTermino.slice(0, 5)}, {sesion.bloquesIds.length} bloques</dd></div>
        <div><dt>Estado</dt><dd>{etiquetasSala[sesion.estadoSala]}</dd></div>
        {sesion.estadoSala !== 'laboratorio' && <div><dt>Salas por tramo</dt><dd>{tramosSalas(sesion, resultado.bloques).map(tramo => <p key={tramo}>{tramo}</p>)}</dd></div>}
      </dl>
    </div>
  </Dialogo>;
}
