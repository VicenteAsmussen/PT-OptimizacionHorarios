import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useSearchParams } from 'react-router-dom';
import IconoActualizar from '../../components/IconoActualizar';
import { estadoSecciones, ordenarPeriodosPorFechaAcademica, planificacionInicial } from '../../lib/periodos';
import { useAuth } from '../../hooks/useAuth';
import { profesoresApi } from '../profesores/profesores.api';
import { puedeOptimizar, prepararRecursos, sugerirRecursos, etiquetasEstado, rutaResultados, crearLaboratoriosModelo, cantidadInicialLaboratoriosModelo, capacidadLaboratoriosModelo, planificacionesModelo, fechaEjecucion } from './modelo';
import { optimizacionApi } from './optimizacion.api';
import { leerDocentesSinDisponibilidad } from './disponibilidad-inicio';
import { useOptimizacion } from './SeguimientoOptimizacion';
import DiagnosticoOptimizacion, { DisponibilidadOptimizacion, type CatalogoNombresDocentes } from './DiagnosticoOptimizacion';
import IconoModelo from './IconoModelo';
import type { BorradorRecurso, DocenteSinDisponibilidad, Preparacion, Recurso } from './types';
import Dialogo from '../resultados-horarios/Dialogo';
import estilos from '../resultados-horarios/ResultadosHorarios.module.css';
import superficies from '../resultados-horarios/SuperficiesResultados.module.css';
import './optimizacion.css';

// Redirige a las cuentas sin permiso para solicitar el cálculo del modelo.
export function RequireOptimizacion() {
  const { usuario } = useAuth();
  return puedeOptimizar(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}
// Sitúa la preparación y el seguimiento en el período autorizado de secretaría.
export default function OptimizacionPage() {
  const { usuario } = useAuth();
  const { planificaciones, error, reintentar } = useOptimizacion();
  const disponibles = planificacionesModelo(planificaciones ?? [], usuario?.rol);
  const [consulta, setConsulta] = useSearchParams();
  const valor = consulta.get('planificacion');
  const id = valor && /^\d+$/.test(valor) ? Number(valor) : null;
  useEffect(() => {
    if (!consulta.has('planificacion') && planificaciones) {
      const inicial = planificacionInicial(disponibles);
      if (inicial) setConsulta({ planificacion: String(inicial) }, { replace: true });
    }
  }, [planificaciones, usuario?.rol, consulta, setConsulta]);
  const planificacion = disponibles.find(p => p.id === id);
  return <section className={`${estilos.pagina} pagina-optimizacion`} aria-labelledby="titulo-modelo">
    <header className={estilos.encabezado}><h1 id="titulo-modelo">Modelo de optimización</h1></header>
    <section className={`${estilos.tarjeta} contexto-modelo`} aria-label="Contexto de la planificación">
      <div className={estilos.controles}><label>Carrera y período<select value={planificacion?.id ?? ''} disabled>
        <option value="">Seleccionar carrera y período</option>
        {ordenarPeriodosPorFechaAcademica(disponibles).map(p => <option key={p.id} value={p.id}>{p.carrera.nombre} · {p.codigo} · {estadoSecciones(p).etiqueta}{p.actual ? ' · Actual' : ''}</option>)}
      </select></label></div>
      {planificacion && <p className="contexto-lectura-modelo" aria-hidden="true">{planificacion.carrera.nombre} · {planificacion.codigo} · {estadoSecciones(planificacion).etiqueta}{planificacion.actual ? ' · Actual' : ''}</p>}
    </section>
    {error ? <div role="alert">{error} <button type="button" className="boton" onClick={reintentar}>Reintentar consulta</button></div>
      : !planificaciones ? <p role="status">Cargando planificaciones…</p>
      : usuario?.rol === 'secretaria' && !disponibles.length ? <p role="status">No se pudo identificar un único período actual de tu carrera. Solicita revisar tu acceso o la planificación vigente.</p>
      : !planificacion ? <p role="status">Selecciona una planificación disponible para tu cuenta.</p>
      : <PreparacionModelo key={planificacion.id} id={planificacion.id} />}
  </section>;
}
// Coordina recursos declarados, confirmación del inicio y diagnóstico del intento.
function PreparacionModelo({ id }: { id: number }) {
  const { usuario } = useAuth();
  const { seguimiento, filas } = useOptimizacion();
  const estado = filas[id];
  const ejecucion = estado?.ejecucion;
  const activa = ejecucion?.estado === 'en_ejecucion';
  const [preparacion, setPreparacion] = useState<Preparacion | null>(null);
  const [salas, setSalas] = useState<BorradorRecurso[]>([]);
  const [cantidadLaboratorios, setCantidadLaboratorios] = useState(String(cantidadInicialLaboratoriosModelo));
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [docentesPendientes, setDocentesPendientes] = useState<DocenteSinDisponibilidad[]>([]);
  const [revisandoDisponibilidad, setRevisandoDisponibilidad] = useState(false);
  const [catalogoDocentes, setCatalogoDocentes] = useState<CatalogoNombresDocentes>({ estado: 'cargando', nombres: {} });
  const vivo = useRef(true);
  const solicitandoInicio = useRef(false);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => {
    let actual = true;
    setCatalogoDocentes({ estado: 'cargando', nombres: {} });
    if (!puedeOptimizar(usuario?.rol)) return;
    profesoresApi.listar().then(docentes => {
      if (actual) setCatalogoDocentes({ estado: 'disponible', nombres: Object.fromEntries(docentes.map(docente => [docente.id, docente.nombre.trim()])) });
    }).catch(() => {
      if (actual) setCatalogoDocentes({ estado: 'error', nombres: {} });
    });
    return () => { actual = false; };
  }, [usuario?.id, usuario?.rol, intento]);
  useEffect(() => {
    let actual = true;
    const controlador = new AbortController();
    setCargando(true); setError(''); setConfirmado(false); setPreparacion(null);
    optimizacionApi.preparar(id, controlador.signal).then(datos => {
      if (actual) { setPreparacion(datos); setSalas(sugerirRecursos(datos.categoriasSalas)); setCantidadLaboratorios(String(cantidadInicialLaboratoriosModelo)); }
    }).catch(fallo => { if (actual) setError(fallo instanceof Error ? fallo.message : 'No se pudo consultar la preparación.'); })
      .finally(() => { if (actual) setCargando(false); });
    void seguimiento.actualizar(id);
    return () => { actual = false; controlador.abort(); };
  }, [id, intento, seguimiento, activa, ejecucion?.id]);
  const bloqueado = activa || estado?.enviando || estado?.incierta;
  // Inicia un cálculo validado o reenvía la solicitud incierta con sus parámetros originales.
  async function iniciar() {
    if (activa || estado?.enviando || solicitandoInicio.current) return;
    solicitandoInicio.current = true;
    setError('');
    try {
      let recursos: Recurso[] = [];
      if (!estado?.incierta) {
        if (!preparacion || !confirmado || !preparacion.puedeEjecutar || cargando || !estado?.consultado) return;
        recursos = prepararRecursos(preparacion.categoriasSalas, salas, [crearLaboratoriosModelo(cantidadLaboratorios)], preparacion.laboratorios.requiereDeclaracion);
        if (preparacion.docentesSinDisponibilidad?.length) {
          // Reconsulta los registros para que el reintento no quede bloqueado por una lista antigua.
          setRevisandoDisponibilidad(true);
          const actual = await optimizacionApi.preparar(id);
          if (!vivo.current) return;
          const pendientes = actual.docentesSinDisponibilidad ?? [];
          setPreparacion(previa => previa && { ...previa, docentesSinDisponibilidad: pendientes });
          if (pendientes.length) { setDocentesPendientes(pendientes); return; }
        }
      }
      await seguimiento.iniciar(id, recursos);
      if (vivo.current) setIntento(i => i + 1);
    } catch (fallo) {
      if (!vivo.current) return;
      const pendientes = leerDocentesSinDisponibilidad(fallo);
      if (pendientes) {
        setPreparacion(previa => previa && { ...previa, docentesSinDisponibilidad: pendientes });
        setDocentesPendientes(pendientes);
        return;
      }
      // El seguimiento conserva el fallo remoto y su recuperación, sin duplicarlo en recursos.
      if (!seguimiento.estado()[id]?.error) setError(fallo instanceof Error ? fallo.message : 'No se pudo confirmar el inicio.');
    } finally {
      solicitandoInicio.current = false;
      if (vivo.current) setRevisandoDisponibilidad(false);
    }
  }
  const seguimientoPrimero = Boolean(ejecucion || estado?.incierta || estado?.error);
  const disponibilidadActualPrioritaria = Boolean(ejecucion && !activa && ejecucion.estado !== 'aplicada'
    && preparacion?.puedeEjecutar && preparacion.disponibilidadDocente.length > 0 && !bloqueado && !cargando);
  const vistaSeguimiento = <section className={seguimientoPrimero ? `${estilos.tarjeta} seguimiento-modelo` : 'seguimiento-modelo seguimiento-modelo--vacio'} aria-labelledby="titulo-seguimiento">
      <div className="cabecera-seguimiento-modelo">
        <h2 id="titulo-seguimiento">{estado?.incierta ? 'Inicio sin confirmar' : activa ? 'Ejecución en curso' : 'Última ejecución'}</h2>
        {ejecucion?.estado === 'aplicada' && <Link className="boton boton--azul" to={rutaResultados(id)}><IconoModelo tipo="ver" />Ver horario generado</Link>}
      </div>
      {!estado?.consultado && !estado?.error && <p role="status">Recuperando última ejecución…</p>}
      {estado?.error && <p role="alert">{estado.error}</p>}
      {estado?.incierta && ejecucion && <p>Última ejecución registrada, no confirma la solicitud pendiente:</p>}
      {ejecucion ? <><p className="estado-ejecucion-modelo" role="status"><strong>{etiquetasEstado[ejecucion.estado]}</strong></p>
        {activa ? <><p>Recargar o salir de esta página no cancela el cálculo. Al volver se consulta la última ejecución, sin iniciar otra.</p>
          <p>Puedes navegar mientras se genera la propuesta. Los datos utilizados no se pueden editar hasta que termine.</p></>
          : ejecucion.estado !== 'aplicada' && <p>No se incorporaron horarios parciales. No se reiniciará el cálculo automáticamente.</p>}
        <dl className="horas-optimizacion">
          <div><dt>Inicio</dt><dd>{fechaEjecucion(ejecucion.iniciadaEn)}</dd></div>
          <div><dt>Término</dt><dd>{ejecucion.finalizadaEn ? fechaEjecucion(ejecucion.finalizadaEn) : activa ? 'En curso' : 'No informado'}</dd></div>
        </dl>
        <DiagnosticoOptimizacion datos={ejecucion.diagnostico} ejecucion={ejecucion} resumirAplicada={ejecucion.estado === 'aplicada'} catalogoDocentes={catalogoDocentes} disponibilidadSecundaria={disponibilidadActualPrioritaria} />
      </> : estado?.consultado && <p>No hay ejecuciones registradas para esta planificación.</p>}
       <button type="button" className="boton" disabled={estado?.enviando || revisandoDisponibilidad} onClick={() => { void seguimiento.actualizar(id); setIntento(i => i + 1); }}><IconoActualizar />Actualizar preparación y seguimiento</button>
      {estado?.incierta && <div className="recuperacion-modelo" role="alert"><p>No se confirmó la respuesta de inicio. Consulta el seguimiento antes de reenviar. Si decides reenviar, se conservarán la misma clave y los parámetros originales, aunque hayas recargado.</p>
        <button type="button" className="boton" disabled={estado.enviando || activa} onClick={() => { void iniciar(); }}>Reenviar la misma solicitud</button></div>}
    </section>;
  return <>
    {seguimientoPrimero && vistaSeguimiento}
    <section className={`${estilos.tarjeta} salas-modelo`} aria-labelledby="titulo-preparacion"><h2 id="titulo-preparacion">{ejecucion ? 'Recursos para una nueva ejecución' : 'Recursos para esta ejecución'}</h2>
      {cargando && <p role="status">Consultando recursos y condiciones de ejecución…</p>}
      {error && <p className="error-modelo" role="alert">{error}</p>}
      {preparacion && <>
        <div className="revision-entradas-modelo">
          <h3>Revisión de entradas</h3>
          {preparacion.bloqueos.length > 0 ? <div id="bloqueos-modelo" role="status" className="condiciones-optimizacion"><p><strong>No se puede iniciar una ejecución</strong></p><ul>{preparacion.bloqueos.map((b, i) => <li key={i}>{b}</li>)}</ul></div>
            : <p>{preparacion.docentesSinDisponibilidad?.length ? 'Hay docentes sin disponibilidad registrada.' : 'La preparación no informa bloqueos para iniciar.'}</p>}
          {preparacion.diagnosticosCatalogo.length > 0 && <details><summary>Observaciones del catálogo</summary><ul>{preparacion.diagnosticosCatalogo.map((d, i) => <li key={i}>Sala {d.salaId}: {d.mensaje}</li>)}</ul></details>}
          {(!ejecucion || disponibilidadActualPrioritaria) && <DisponibilidadOptimizacion filas={preparacion.disponibilidadDocente} catalogoDocentes={catalogoDocentes} titulo="Disponibilidad docente de la preparación" />}
        </div>
        <p id="ayuda-recursos-modelo" className="ayuda-salas-modelo">Indica las cantidades para esta ejecución, sin garantía de disponibilidad física. Para las salas se sugiere la mitad del catálogo.</p>
        <form onSubmit={e => { e.preventDefault(); void iniciar(); }}>
          <fieldset disabled={Boolean(bloqueado) || !preparacion.puedeEjecutar || cargando || revisandoDisponibilidad} aria-describedby={`ayuda-recursos-modelo${preparacion.bloqueos.length ? ' bloqueos-modelo' : ''}`}>
            <legend className="solo-lectores-modelo">Cantidades para esta ejecución</legend>
            <div className="tabla-optimizacion tabla-salas-modelo" role="region" aria-label="Salas por categoría" tabIndex={0}><table><caption className="solo-lectores-modelo">Salas por categoría</caption><thead><tr><th scope="col">Edificio</th><th scope="col">Tipo</th><th scope="col" className="numero-modelo">Capacidad</th><th scope="col" className="numero-modelo">Total en catálogo</th><th scope="col" className="numero-modelo">Cantidad para el modelo</th></tr></thead>
              <tbody>{preparacion.categoriasSalas.map((c, i) => <tr key={c.id}><th scope="row">{c.edificio}</th><td>{c.tipo}</td><td className="numero-modelo">{c.capacidad}</td><td className="numero-modelo">{c.cantidadCatalogo}</td>
                <td className="numero-modelo"><label className="campo-cantidad-sala-modelo"><input name={`cantidad-sala-${c.id}`} aria-describedby="ayuda-recursos-modelo" aria-label={`Cantidad ${c.edificio}, ${c.tipo}, capacidad ${c.capacidad}`} type="number" min="0" max={Math.min(c.cantidadCatalogo, 10000)} step="1" required value={salas[i]?.cantidad ?? ''}
                  onChange={e => { setConfirmado(false); setSalas(filas => filas.map(f => f.id === c.id ? { ...f, cantidad: e.target.value } : f)); }} /></label></td></tr>)}</tbody></table></div>
            {!salas.length && <p>No hay categorías de salas acreditadas disponibles.</p>}
            <div className="laboratorios-optimizacion"><label>Cantidad de laboratorios<input name="cantidad-laboratorios" aria-label="Cantidad de laboratorios" aria-describedby="supuesto-laboratorios ayuda-recursos-modelo" required type="number" min={0} max={10000} step="1" value={cantidadLaboratorios}
              onChange={e => { setConfirmado(false); setCantidadLaboratorios(e.target.value); }} /></label>
              <p id="supuesto-laboratorios">Capacidad del modelo: {capacidadLaboratoriosModelo} estudiantes, fija para los laboratorios.</p></div>
            <label className="confirmacion-optimizacion"><input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} /><span>Confirmo las cantidades para esta ejecución.</span></label>
            <button type="submit" className="boton boton--azul" disabled={!confirmado || !estado?.consultado || Boolean(estado?.error) || Boolean(bloqueado)}><IconoModelo tipo="ejecutar" />{estado?.enviando ? 'Iniciando…' : revisandoDisponibilidad ? 'Revisando disponibilidad…' : 'Iniciar ejecución'}</button>
          </fieldset>
        </form>
      </>}
    </section>
    {!seguimientoPrimero && vistaSeguimiento}
    {docentesPendientes.length > 0 && <Dialogo titulo="No se puede iniciar la optimización" tamano="detalle" ocupado={false} cerrar={() => setDocentesPendientes([])}>
      <p>Los siguientes profesores tienen carga asignada y aún no han registrado su disponibilidad para este período</p>
      <ul className={superficies.tarjetasPendientes} aria-label="Profesores sin disponibilidad registrada">
        {docentesPendientes.map(docente => <li key={docente.profesorId}>
          <article className={superficies.tarjeta} aria-label={docente.nombre}>
            <h3 className="nombre-docente-pendiente">{docente.nombre}</h3>
            <p>Disponibilidad no registrada</p>
            <p><strong className="etiqueta-bloques-pendientes">{docente.bloquesEnviados} / {docente.minimoBloques} bloques</strong></p>
          </article>
        </li>)}
      </ul>
      <p>Cada profesor debe guardar su disponibilidad en Mi disponibilidad. Después, vuelva a intentar iniciar la ejecución</p>
    </Dialogo>}
  </>;
}
