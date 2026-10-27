import { accionesReinicio, confirmarReinicio, estadosPeriodo, puedeCambiarEstado, puedeReiniciar } from './modelo';
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
}
export default function VistaPeriodo({ resumenes, nuevoEstado, accion, confirmacion, bloqueado,
  alNuevoEstado, alSeleccionarAccion, alConfirmacion, alReiniciar, alCancelar, alCambiarEstado }: Propiedades) {
  const { planificacion } = resumenes.todas;
  const horarios = resumenes.gestionadas.horarios;
  const resumen = accion ? resumenes[accion.alcance] : null;
  const confirmado = !!accion && !!resumen && puedeReiniciar(accion, resumen) && confirmarReinicio(resumen, planificacion.id, accion.alcance, confirmacion);
  const cambioPermitido = puedeCambiarEstado(planificacion.estadoPlanificacion, nuevoEstado, horarios);
  return <>
    <section className={base.pagina} aria-labelledby="titulo-estado">
      <header className={estilos.cabeceraTarjeta}>
        <h2 id="titulo-estado">Estado del período</h2>
        <span className={estilos.distintivo}><span className={base.soloLectores}>Estado actual: </span>{estadosPeriodo[planificacion.estadoPlanificacion]}</span>
      </header>
      <form className={base.campos} onSubmit={evento => { evento.preventDefault(); if (!bloqueado && cambioPermitido) alCambiarEstado(); }}>
        <label>Nuevo estado<select disabled={bloqueado} value={nuevoEstado} onChange={evento => alNuevoEstado(evento.target.value as EstadoPeriodo)}>
          {Object.entries(estadosPeriodo).map(([valor, texto]) =>
            <option key={valor} value={valor} disabled={valor !== planificacion.estadoPlanificacion
              && !puedeCambiarEstado(planificacion.estadoPlanificacion, valor as EstadoPeriodo, horarios)}>{texto}</option>)}
        </select></label>
        {horarios > 0 && planificacion.estadoPlanificacion !== 'preparacion' && <p>Para volver a Preparación, elimina primero los horarios gestionados. Los externos pueden conservarse.</p>}
        {horarios === 0 && <p className={estilos.notaEstado}>Para pasar a Propuesta o Publicado, deben existir horarios de las ofertas gestionadas.</p>}
        <div><button disabled={bloqueado || !cambioPermitido}>Cambiar estado</button></div>
      </form>
    </section>
    <section className={base.pagina} aria-labelledby="titulo-reinicio">
      <header className={estilos.cabeceraTarjeta}>
        <h2 id="titulo-reinicio">Reiniciar datos</h2>
        <span className={estilos.distintivo}><span className={base.soloLectores}>Carrera: </span>{planificacion.carrera.nombre}</span>
      </header>
      <ol className={estilos.pasos} aria-label="Orden de reinicio">
        <li><span className={estilos.numeroPaso} aria-hidden="true">1</span>Reiniciar horarios</li>
        <li><span className={estilos.flechaPaso} aria-hidden="true">→</span><span className={estilos.numeroPaso} aria-hidden="true">2</span>Reiniciar ofertas</li>
      </ol>
      <p className={estilos.descripcion}>Reinicia el mismo grupo: gestionadas o externas. Los reinicios no se pueden deshacer.</p>
      <div className={estilos.acciones}>
        {accionesReinicio.map(opcion => <div key={`${opcion.objetivo}:${opcion.alcance}`}>
          <button disabled={bloqueado || !puedeReiniciar(opcion, resumenes[opcion.alcance])} onClick={() => alSeleccionarAccion(opcion)}>{opcion.etiqueta}</button>
          <p>{opcion.descripcion}</p>
        </div>)}
      </div>
      {accion && resumen && <form className={`${base.campos} ${estilos.confirmacion}`} onSubmit={evento => { evento.preventDefault(); if (!bloqueado && confirmado) alReiniciar(); }}>
        <h3>{accion.etiqueta}</h3>
        <p>{planificacion.carrera.nombre} · {planificacion.codigo}</p>
        <p>{accion.objetivo === 'ofertas'
          ? `Se eliminarán ${resumen.ofertas} ofertas, ${resumen.asignaciones} asignaciones y ${resumen.horarios} bloques de horario.`
          : `Se eliminarán ${resumen.horarios} bloques de horario. Las ofertas y sus docentes se conservan.`}</p>
        <label>Escribe {planificacion.codigo} para confirmar<input autoComplete="off" disabled={bloqueado} value={confirmacion} onChange={evento => alConfirmacion(evento.target.value)} /></label>
        <div className={base.acciones}>
          <button disabled={bloqueado || !confirmado}>Confirmar reinicio</button>
          <button type="button" disabled={bloqueado} onClick={alCancelar}>Cancelar</button>
        </div>
      </form>}
    </section>
  </>;
}
