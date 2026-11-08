import { accionesReinicio, confirmarReinicio, estadosPeriodo, puedeCambiarEstado, puedeEliminarPeriodo, puedeReiniciar } from './modelo';
import type { AccionReinicio, EstadoPeriodo, ResumenesPeriodo } from './modelo';
import base from '../asignaturas/Asignaturas.module.css';
import estilos from './AdministracionPeriodos.module.css';

interface Propiedades {
  resumenes: ResumenesPeriodo;
  nuevoEstado: EstadoPeriodo;
  accion: AccionReinicio | null;
  confirmacion: string;
  bloqueado: boolean;
  alNuevoEstado: (estado: EstadoPeriodo) => void;
  alSeleccionarAccion: (accion: AccionReinicio) => void;
  alConfirmacion: (texto: string) => void;
  alReiniciar: () => void;
  alCancelar: () => void;
  alCambiarEstado: () => void;
  alMarcarActual: () => void;
  alSolicitarEliminacion: () => void;
  confirmacionEliminacion: string | null;
  alConfirmacionEliminacion: (texto: string) => void;
  alCancelarEliminacion: () => void;
  alEliminar: () => void;
}
export default function VistaPeriodo({ resumenes, nuevoEstado, accion, confirmacion, bloqueado,
  alNuevoEstado, alSeleccionarAccion, alConfirmacion, alReiniciar, alCancelar, alCambiarEstado,
  alMarcarActual, alSolicitarEliminacion, confirmacionEliminacion = null, alConfirmacionEliminacion, alCancelarEliminacion, alEliminar }: Propiedades) {
  const { planificacion } = resumenes.todas;
  const horarios = resumenes.gestionadas.horarios;
  const resumen = accion ? resumenes[accion.alcance] : null;
  const confirmado = !!accion && !!resumen && puedeReiniciar(accion, resumen) && confirmarReinicio(resumen, planificacion.id, accion.alcance, confirmacion);
  const cambioPermitido = puedeCambiarEstado(planificacion.estadoPlanificacion, nuevoEstado, horarios);
  const eliminacionPermitida = puedeEliminarPeriodo(resumenes.todas, planificacion.id);
  const eliminacionConfirmada = eliminacionPermitida && confirmacionEliminacion === planificacion.codigo;
  const motivoEliminacion = eliminacionPermitida ? '' : planificacion.estadoPlanificacion !== 'preparacion'
    ? 'Requiere el estado Preparación y no tener ofertas en ningún departamento.'
    : `El período todavía tiene ${resumenes.todas.ofertas} ofertas. No debe tener ofertas en ningún departamento.`;
  return <>
    <section className={`${base.pagina} ${estilos.contextoPeriodo}`} aria-labelledby="titulo-periodo">
      <div>
        <h2 id="titulo-periodo">Período {planificacion.codigo}</h2>
        <p className={estilos.nombreCarrera}>{planificacion.carrera.nombre}</p>
      </div>
      <div className={estilos.identidadPeriodo}>
        <span className={estilos.estadoPeriodo}><span className={base.soloLectores}>Estado de planificación: </span>{estadosPeriodo[planificacion.estadoPlanificacion]}</span>
        {planificacion.actual ? <span className={estilos.distintivo}>Actual</span> : <>
          <span className={estilos.ayuda}>No es el actual</span>
          <button type="button" className={`boton ${base.accionSecundaria}`} aria-describedby="ayuda-actual"
            disabled={bloqueado} onClick={() => { if (!bloqueado && !planificacion.actual) alMarcarActual(); }}>Marcar como actual</button>
        </>}
      </div>
      {!planificacion.actual && <p id="ayuda-actual" className={estilos.ayuda}>Marcarlo reemplaza al período actual de esta carrera, sin cambiar su estado ni sus datos.</p>}
    </section>
    <section className={base.pagina} aria-labelledby="titulo-estado">
      <header className={estilos.cabeceraTarjeta}>
        <h2 id="titulo-estado">Estado de planificación</h2>
      </header>
      <p className={estilos.ayuda}>Preparación organiza los datos, Propuesta identifica el horario en revisión y Publicado, el horario publicado.</p>
      <form id="formulario-estado-periodo" className={base.campos} onSubmit={evento => { evento.preventDefault(); if (!bloqueado && cambioPermitido) alCambiarEstado(); }}>
        <label>Nuevo estado<select name="estadoPlanificacion" aria-describedby="condicion-estado" disabled={bloqueado} value={nuevoEstado} onChange={evento => alNuevoEstado(evento.target.value as EstadoPeriodo)}>
          {Object.entries(estadosPeriodo).map(([valor, texto]) =>
            <option key={valor} value={valor} disabled={valor !== planificacion.estadoPlanificacion
              && !puedeCambiarEstado(planificacion.estadoPlanificacion, valor as EstadoPeriodo, horarios)}>{texto}</option>)}
        </select></label>
        <p id="condicion-estado" className={estilos.notaEstado}>{horarios === 0
          ? 'Para pasar a Propuesta o Publicado, deben existir horarios de las ofertas gestionadas.'
          : planificacion.estadoPlanificacion !== 'preparacion'
            ? 'Para volver a Preparación, elimina primero los horarios gestionados. Los externos pueden conservarse.'
            : 'Existen horarios gestionados. Puedes pasar a Propuesta o Publicado.'}</p>
        <div className={base.acciones}>
          <button type="submit" className={`boton ${base.accionPrincipal}`} disabled={bloqueado || !cambioPermitido}>Cambiar estado</button>
        </div>
      </form>
    </section>
    <section className={base.pagina} aria-labelledby="titulo-reinicio">
      <header className={estilos.cabeceraTarjeta}>
        <h2 id="titulo-reinicio">Reiniciar datos</h2>
      </header>
      <ol className={estilos.pasos} aria-label="Orden de reinicio">
        <li><span className={estilos.numeroPaso} aria-hidden="true">1</span>Reiniciar horarios</li>
        <li><span className={estilos.flechaPaso} aria-hidden="true">→</span><span className={estilos.numeroPaso} aria-hidden="true">2</span>Reiniciar ofertas</li>
      </ol>
      <p className={estilos.ayuda}>Reinicia horarios antes que ofertas del mismo grupo. Los reinicios no se pueden deshacer.</p>
      <div className={estilos.gruposReinicio}>
        {(['gestionadas', 'externas'] as const).map(alcance => <div key={alcance} className={estilos.grupoReinicio} role="group" aria-labelledby={`titulo-reinicio-${alcance}`}>
          <h3 id={`titulo-reinicio-${alcance}`}>{alcance === 'gestionadas' ? 'Gestionadas' : 'Externas'}</h3>
          {accionesReinicio.filter(opcion => opcion.alcance === alcance).map(opcion => {
            const datos = resumenes[alcance];
            const ayuda = datos[opcion.objetivo] === 0
              ? `No hay ${opcion.objetivo === 'horarios' ? 'horarios' : 'ofertas'} para reiniciar.`
              : opcion.objetivo === 'ofertas' && datos.horarios > 0
                ? 'Reinicia primero los horarios de este grupo.'
                : opcion.objetivo === 'horarios'
                  ? `${datos.horarios} bloques. Conserva ofertas y docentes.`
                  : `${datos.ofertas} ofertas y ${datos.asignaciones} asignaciones docentes.`;
            return <div key={opcion.objetivo} className={estilos.accionReinicio}>
              <button type="button" className="boton boton--gris" aria-describedby={`ayuda-${opcion.objetivo}-${alcance}`}
                disabled={bloqueado || !puedeReiniciar(opcion, datos)} onClick={() => alSeleccionarAccion(opcion)}>{opcion.etiqueta}</button>
              <p id={`ayuda-${opcion.objetivo}-${alcance}`} className={estilos.ayuda}>{ayuda}</p>
            </div>;
          })}
        </div>)}
      </div>
      {accion && resumen && <form className={`${base.campos} ${estilos.confirmacion}`} aria-labelledby="titulo-confirmacion-reinicio" onSubmit={evento => { evento.preventDefault(); if (!bloqueado && confirmado) alReiniciar(); }}>
        <h3 id="titulo-confirmacion-reinicio">{accion.etiqueta}</h3>
        <p>{planificacion.carrera.nombre} · {planificacion.codigo}</p>
        <p id="efecto-reinicio">{accion.objetivo === 'ofertas'
          ? `Se eliminarán ${resumen.ofertas} ofertas, ${resumen.asignaciones} asignaciones y ${resumen.horarios} bloques de horario.`
          : `Se eliminarán ${resumen.horarios} bloques de horario. Las ofertas y sus docentes se conservan.`}</p>
        <label>Escribe {planificacion.codigo} para confirmar<input name="confirmacionReinicio" spellCheck={false} autoComplete="off" aria-describedby="efecto-reinicio" disabled={bloqueado} value={confirmacion} onChange={evento => alConfirmacion(evento.target.value)} /></label>
        <div className={base.acciones}>
          <button className="boton boton--eliminar" disabled={bloqueado || !confirmado}>Confirmar reinicio</button>
          <button type="button" className={`boton ${base.accionSecundaria}`} disabled={bloqueado} onClick={alCancelar}>Cancelar</button>
        </div>
      </form>}
    </section>
    <section className={`${base.pagina} ${estilos.zonaEliminacion}`} aria-labelledby="titulo-eliminacion">
      <header className={estilos.cabeceraTarjeta}><h2 id="titulo-eliminacion">Eliminar período</h2></header>
      {motivoEliminacion && <p id="motivo-eliminacion" className={estilos.ayuda}>{motivoEliminacion}</p>}
      <button type="button" className="boton boton--eliminar" aria-describedby={motivoEliminacion ? 'motivo-eliminacion' : undefined}
        disabled={bloqueado || !eliminacionPermitida} onClick={() => { if (!bloqueado && eliminacionPermitida) alSolicitarEliminacion(); }}>Eliminar período</button>
      {confirmacionEliminacion !== null && <form className={`${base.campos} ${estilos.confirmacion}`} aria-label="Confirmar eliminación de período"
        onSubmit={evento => { evento.preventDefault(); if (!bloqueado && eliminacionConfirmada) alEliminar(); }}>
        <h3>Confirmar eliminación de {planificacion.codigo}</h3>
        <p id="efecto-eliminacion">{planificacion.carrera.nombre} · {planificacion.codigo}. Esta eliminación no se puede deshacer.</p>
        <label>Escribe {planificacion.codigo} para eliminar el período<input name="confirmacionEliminacion" spellCheck={false} autoComplete="off" aria-describedby="efecto-eliminacion" disabled={bloqueado} value={confirmacionEliminacion} onChange={evento => alConfirmacionEliminacion(evento.target.value)} /></label>
        <div className={base.acciones}>
          <button className="boton boton--eliminar" disabled={bloqueado || !eliminacionConfirmada}>Confirmar eliminación</button>
          <button type="button" className={`boton ${base.accionSecundaria}`} disabled={bloqueado} onClick={alCancelarEliminacion}>Cancelar eliminación</button>
        </div>
      </form>}
    </section>
  </>;
}
