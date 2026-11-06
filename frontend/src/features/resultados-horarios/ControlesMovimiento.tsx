import { bloquesDestino, estadoDestino, gruposMovibles } from './modelo';
import type { Movimiento, ResultadoHorario, SesionResultado, ValidacionMovimiento } from './types';
import estilos from './ResultadosHorarios.module.css';

export default function ControlesMovimiento({ resultado, sesion, grupo, datos, validacion, error, aprobado, ocupado,
  cambiarGrupo, cancelar, confirmar }: {
  resultado: ResultadoHorario; sesion: SesionResultado; grupo: number; datos: Movimiento;
  validacion: ValidacionMovimiento | null; error: string; aprobado: boolean; ocupado: boolean;
  cambiarGrupo: (indice: number) => void; cancelar: () => void; confirmar: () => void;
}) {
  const estado = estadoDestino(resultado, sesion, datos.bloqueInicioId, datos.idsHorarios.length);
  const disponible = estado === 'disponible';
  const grupos = gruposMovibles(sesion, resultado.bloques);
  function describirOrigen(ids: number[]) {
    const indices = ids.map(id => sesion.idsHorarios.indexOf(id));
    const inicio = resultado.bloques.find(b => b.id === sesion.bloquesIds[indices[0]]);
    const fin = resultado.bloques.find(b => b.id === sesion.bloquesIds[indices.at(-1)!]);
    return { dia: inicio?.dia ?? sesion.dia,
      rango: inicio && fin ? `${inicio.horaInicio.slice(0, 5)}–${fin.horaTermino.slice(0, 5)}` : 'Horario no disponible' };
  }
  const origen = describirOrigen(datos.idsHorarios);
  const destino = disponible ? bloquesDestino(resultado.bloques, datos.bloqueInicioId, datos.idsHorarios.length) : [];
  const inicioDestino = destino[0];
  const finDestino = destino.at(-1);
  return <section id="controles-movimiento" className={estilos.editor} aria-labelledby="titulo-movimiento">
    <h3 id="titulo-movimiento">Mover {sesion.asignatura.nombre}</h3>
    <p>{sesion.profesor.nombre} · Sección {sesion.seccion} · {sesion.tipoHora.tipo} · {sesion.dia} {sesion.horaInicio.slice(0, 5)}–{sesion.horaTermino.slice(0, 5)}</p>
    <p role="status">Disponibilidad de {sesion.profesor.nombre} para {resultado.planificacion.codigo}: {resultado.disponibilidades.filter(d => d.profesorId === sesion.profesorId && d.planificacionSemestreId === resultado.planificacion.id).length} bloques declarados.
      {!resultado.disponibilidades.some(d => d.profesorId === sesion.profesorId && d.planificacionSemestreId === resultado.planificacion.id) && ' No hay disponibilidad declarada, no se habilitan destinos.'}</p>
    {grupos.length > 1 && <fieldset className={estilos.gruposMovimiento} disabled={ocupado}>
      <legend>Bloques que se moverán</legend>
      <div className={estilos.opcionesGrupos} role="group" aria-label="Grupos de bloques">
        {grupos.map((ids, i) => {
          const tramo = describirOrigen(ids);
          return <button type="button" key={ids.join(',')} className={estilos.grupoMovimiento}
            aria-pressed={grupo === i} disabled={ocupado} onClick={() => { if (!ocupado && grupo !== i) cambiarGrupo(i); }}>
            <span>{i === 0 ? 'Sesión completa' : 'Grupo parcial'}</span>
            <strong>{ids.length} bloques</strong>
            <span>{tramo.dia} {tramo.rango}</span>
          </button>;
        })}
      </div>
    </fieldset>}
    <div className={estilos.trayectoMovimiento} aria-label="Movimiento seleccionado" aria-live="polite">
      <div className={estilos.tramoMovimiento}>
        <strong>Origen</strong><span>{origen.dia}</span><span>{origen.rango}</span><span>{datos.idsHorarios.length} bloques</span>
      </div>
      <span className={estilos.flechaMovimiento} aria-hidden="true">→</span>
      <div className={`${estilos.tramoMovimiento} ${estilos.tramoDestino}`}>
        <strong>Destino</strong>
        {inicioDestino && finDestino ? <>
          <span>{inicioDestino.dia}</span>
          <span>{inicioDestino.horaInicio.slice(0, 5)}–{finDestino.horaTermino.slice(0, 5)}</span>
          <span>{destino.length} bloques · Sin guardar</span>
        </> : <span>Selecciona el destino en la grilla.</span>}
      </div>
    </div>
    <div aria-live="polite">
      {datos.bloqueInicioId > 0 && !disponible && <p className={estilos.error} role="alert">{estado === 'inicioPar' ? 'La clase debe comenzar en un bloque institucional impar.' : estado === 'ocupado' ? 'El destino está ocupado por una clase de este semestre o del profesor.' : 'El destino no admite todos los bloques dentro de la disponibilidad declarada del profesor.'}</p>}
      {datos.bloqueInicioId > 0 && disponible && !validacion && !error && <p role="status">Validando destino…</p>}
      {validacion?.problemas.map((p, i) => <p className={estilos.error} key={i}>{p.mensaje}</p>)}
      {error && <p className={estilos.error} role="alert">{error} Cancela el movimiento y actualiza el horario antes de reintentar.</p>}
      {aprobado && <p>Destino validado. Confirma para guardar {datos.idsHorarios.length} bloques.</p>}
    </div>
    <div className={estilos.acciones}>
      <button type="button" className="boton boton--azul" disabled={ocupado || !aprobado} onClick={confirmar}>{ocupado ? 'Guardando…' : 'Confirmar movimiento'}</button>
      <button type="button" className="boton" disabled={ocupado} onClick={cancelar}>Cancelar movimiento</button>
    </div>
  </section>;
}
