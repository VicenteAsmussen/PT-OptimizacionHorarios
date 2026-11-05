import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { estadoSecciones, planificacionInicial } from '../asignaturas/datos';
import { puedeOptimizar, prepararRecursos, sugerirRecursos, etiquetasEstado, rutaResultados, crearLaboratoriosModelo, cantidadInicialLaboratoriosModelo, capacidadLaboratoriosModelo, planificacionesModelo, fechaEjecucion } from './modelo';
import { optimizacionApi } from './optimizacion.api';
import { useOptimizacion } from './SeguimientoOptimizacion';
import DiagnosticoOptimizacion, { DisponibilidadOptimizacion } from './DiagnosticoOptimizacion';
import type { BorradorRecurso, Preparacion, Recurso } from './types';
import estilos from '../resultados-horarios/ResultadosHorarios.module.css';
import './optimizacion.css';

export function RequireOptimizacion() {
  const { usuario } = useAuth();
  return puedeOptimizar(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}
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
    <header className={estilos.tarjeta}><h1 id="titulo-modelo">Modelo de optimización</h1>
      <p>Solo puedes ejecutar el modelo cuando la planificación está en Preparación.</p>
      <div className={estilos.controles}><label>Carrera y período<select value={planificacion?.id ?? ''} disabled={usuario?.rol !== 'admin' || !planificaciones} onChange={e => {
        if (usuario?.rol === 'admin' && (!e.target.value || disponibles.some(p => String(p.id) === e.target.value))) setConsulta(e.target.value ? { planificacion: e.target.value } : {});
      }}>
        <option value="">Seleccionar carrera y período</option>
        {disponibles.map(p => <option key={p.id} value={p.id}>{p.carrera.nombre} · {p.codigo} · {estadoSecciones(p).etiqueta}{p.actual ? ' · Actual' : ''}</option>)}
      </select></label></div>
    </header>
    {error ? <div role="alert">{error} <button type="button" className="boton" onClick={reintentar}>Reintentar consulta</button></div>
      : !planificaciones ? <p role="status">Cargando planificaciones…</p>
      : usuario?.rol === 'secretaria' && !disponibles.length ? <p role="status">No se pudo identificar un único período actual de tu carrera. Solicita revisar tu acceso o la planificación vigente.</p>
      : !planificacion ? <p role="status">Selecciona una planificación disponible para tu cuenta.</p>
      : <PreparacionModelo key={planificacion.id} id={planificacion.id} />}
  </section>;
}
function PreparacionModelo({ id }: { id: number }) {
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
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
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
  }, [id, intento, seguimiento, activa]);
  const bloqueado = activa || estado?.enviando || estado?.incierta;
  async function iniciar() {
    if (activa || estado?.enviando) return;
    setError('');
    try {
      let recursos: Recurso[] = [];
      if (!estado?.incierta) {
        if (!preparacion || !confirmado || !preparacion.puedeEjecutar || cargando || !estado?.consultado) return;
        recursos = prepararRecursos(preparacion.categoriasSalas, salas, [crearLaboratoriosModelo(cantidadLaboratorios)], preparacion.laboratorios.requiereDeclaracion);
      }
      await seguimiento.iniciar(id, recursos);
      if (vivo.current) setIntento(i => i + 1);
    } catch (fallo) {
      if (vivo.current) setError(fallo instanceof Error ? fallo.message : 'No se pudo confirmar el inicio.');
    }
  }
  return <>
    <section className={estilos.tarjeta} aria-labelledby="titulo-seguimiento"><h2 id="titulo-seguimiento">Seguimiento</h2>
      <p>Recargar o salir de esta página no cancela el cálculo. Al volver se consulta la última ejecución, sin iniciar otra.</p>
      {!estado?.consultado && !estado?.error && <p role="status">Recuperando última ejecución…</p>}
      {estado?.error && <p role="alert">{estado.error}</p>}
      {ejecucion ? <><p className={estilos.estado} role="status">{etiquetasEstado[ejecucion.estado]}</p>
        {activa ? <p>Puedes navegar mientras se genera la propuesta. Los datos utilizados no se pueden editar hasta que termine.</p>
          : ejecucion.estado !== 'aplicada' && <p>No se incorporaron horarios parciales. No se reiniciará el cálculo automáticamente.</p>}
        {ejecucion.estado === 'aplicada' && <p>La propuesta no está publicada. <Link to={rutaResultados(id)}>Ver resultado</Link></p>}
        <DiagnosticoOptimizacion datos={ejecucion.diagnostico} resumirAplicada={ejecucion.estado === 'aplicada'} />
        <dl className="horas-optimizacion">
          <div><dt>Inicio</dt><dd>{fechaEjecucion(ejecucion.iniciadaEn)}</dd></div>
          <div><dt>Término</dt><dd>{ejecucion.finalizadaEn ? fechaEjecucion(ejecucion.finalizadaEn) : activa ? 'En curso' : 'No informado'}</dd></div>
        </dl>
      </> : estado?.consultado && <p>No hay ejecuciones registradas para esta planificación.</p>}
      <button type="button" className="boton" disabled={estado?.enviando} onClick={() => { void seguimiento.actualizar(id); setIntento(i => i + 1); }}>Actualizar preparación y seguimiento</button>
      {estado?.incierta && <div role="alert"><p>No se confirmó la respuesta de inicio. Consulta el seguimiento antes de reenviar. Si decides reenviar, se conservarán la misma clave y los parámetros originales, aunque hayas recargado.</p>
        <button type="button" className="boton" disabled={estado.enviando || activa} onClick={() => { void iniciar(); }}>Reenviar la misma solicitud</button></div>}
    </section>
    <section className={`${estilos.tarjeta} salas-modelo`} aria-labelledby="titulo-preparacion"><h2 id="titulo-preparacion">Salas para el modelo</h2>
      {cargando && <p role="status">Revisando entradas…</p>}
      {error && <p role="alert">{error}</p>}
      {preparacion && <>
        <p className="ayuda-salas-modelo">Indica cuántas salas usar. Sugerimos la mitad del catálogo, redondeada hacia arriba, sin garantizar disponibilidad física.</p>
        {preparacion.bloqueos.length > 0 && <div role="status" className="condiciones-optimizacion"><ul>{preparacion.bloqueos.map((b, i) => <li key={i}>{b}</li>)}</ul></div>}
        {preparacion.diagnosticosCatalogo.length > 0 && <details><summary>Observaciones del catálogo</summary><ul>{preparacion.diagnosticosCatalogo.map((d, i) => <li key={i}>Sala {d.salaId}: {d.mensaje}</li>)}</ul></details>}
        <DisponibilidadOptimizacion filas={preparacion.disponibilidadDocente} />
        <form onSubmit={e => { e.preventDefault(); void iniciar(); }}>
          <fieldset disabled={Boolean(bloqueado) || !preparacion.puedeEjecutar || cargando}>
            <legend className="solo-lectores-modelo">Cantidades para esta ejecución</legend>
            <div className="tabla-optimizacion"><table><caption className="solo-lectores-modelo">Salas por categoría</caption><thead><tr><th scope="col">Edificio</th><th scope="col">Tipo</th><th scope="col">Capacidad</th><th scope="col">Total en catálogo</th><th scope="col">Cantidad para el modelo</th></tr></thead>
              <tbody>{preparacion.categoriasSalas.map((c, i) => <tr key={c.id}><th scope="row">{c.edificio}</th><td>{c.tipo}</td><td>{c.capacidad}</td><td>{c.cantidadCatalogo}</td>
                <td><input aria-label={`Cantidad ${c.edificio}, ${c.tipo}, capacidad ${c.capacidad}`} type="number" min="0" max={Math.min(c.cantidadCatalogo, 10000)} step="1" required value={salas[i]?.cantidad ?? ''}
                  onChange={e => { setConfirmado(false); setSalas(filas => filas.map(f => f.id === c.id ? { ...f, cantidad: e.target.value } : f)); }} /></td></tr>)}</tbody></table></div>
            {!salas.length && <p>No hay categorías de salas acreditadas disponibles.</p>}
            <div className="laboratorios-optimizacion"><label>Cantidad de laboratorios<input aria-label="Cantidad de laboratorios" aria-describedby="supuesto-laboratorios" required type="number" min={0} max={10000} step="1" value={cantidadLaboratorios}
              onChange={e => { setConfirmado(false); setCantidadLaboratorios(e.target.value); }} /></label>
              <p id="supuesto-laboratorios">Capacidad del modelo: {capacidadLaboratoriosModelo} estudiantes. No representa disponibilidad física garantizada.</p></div>
            <label className="confirmacion-optimizacion"><input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} /><span>Confirmo las cantidades para esta ejecución. Las sugerencias no garantizan disponibilidad.</span></label>
            <button type="submit" className="boton boton--azul" disabled={!confirmado || !estado?.consultado || Boolean(estado?.error) || Boolean(bloqueado)}>{estado?.enviando ? 'Iniciando…' : 'Iniciar ejecución'}</button>
          </fieldset>
        </form>
      </>}
    </section>
  </>;
}
