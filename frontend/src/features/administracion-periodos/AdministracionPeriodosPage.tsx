import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { notificaciones } from '../../lib/notificaciones';
import type { PlanificacionSemestre } from '../asignaturas/types';
import { administracionPeriodosApi as servicio } from './administracion-periodos.api';
import { confirmarReinicio, estadosPeriodo, puedeAdministrarPeriodos, puedeCambiarEstado, puedeEliminarPeriodo, puedeReiniciar } from './modelo';
import type { AccionReinicio, EstadoPeriodo, ResumenesPeriodo } from './modelo';
import VistaPeriodo from './VistaPeriodo';
import SelectorPeriodo from './SelectorPeriodo';
import base from '../asignaturas/Asignaturas.module.css';
import estilos from './AdministracionPeriodos.module.css';

export function RequireAdministracionPeriodos() {
  const { usuario } = useAuth();
  return puedeAdministrarPeriodos(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}
export default function AdministracionPeriodosPage() {
  const { usuario } = useAuth();
  return <PaginaAdministracion key={usuario?.id} />;
}
function PaginaAdministracion() {
  const [planificaciones, setPlanificaciones] = useState<PlanificacionSemestre[] | null>(null);
  const [carreras, setCarreras] = useState<PlanificacionSemestre['carrera'][] | null>(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [carreraId, setCarreraId] = useState('');
  const [planificacionId, setPlanificacionId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorLista, setErrorLista] = useState('');
  const vigente = useRef(false);
  const bloqueo = useRef(false);
  const seleccion = useRef({ carreraId: '', planificacionId: '' });
  const codigoVigente = useRef('');
  function cambiarCodigo(valor: string) { codigoVigente.current = valor; setCodigo(valor); }
  const carrera = carreras?.find(fila => fila.id === Number(carreraId));
  const codigoValido = codigo.length === 6 && /^[0-9]{4}-[12]$/.test(codigo);
  useEffect(() => {
    let activa = true; vigente.current = true;
    setPlanificaciones(null); setCarreras(null); setError(''); setCarreraId(''); setPlanificacionId('');
    seleccion.current = { carreraId: '', planificacionId: '' };
    Promise.all([servicio.carreras(), servicio.planificaciones()]).then(([catalogo, datos]) => {
      if (activa) { setCarreras(catalogo); setPlanificaciones(datos); }
    }).catch(fallo => { if (activa) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar las carreras y los períodos.'); });
    return () => { activa = false; vigente.current = false; };
  }, [intento]);
  function iniciar() {
    if (bloqueo.current) return false;
    bloqueo.current = true; setOcupado(true); return true;
  }
  function terminar() { bloqueo.current = false; if (vigente.current) setOcupado(false); }
  async function refrescarLista() {
    setErrorLista('');
    try {
      const datos = await servicio.planificaciones();
      if (vigente.current) setPlanificaciones(datos);
    } catch (fallo) {
      if (vigente.current) setErrorLista(`No se pudo actualizar la lista de períodos. ${fallo instanceof Error ? fallo.message : 'Intenta actualizarla nuevamente.'}`);
    }
  }
  async function actualizar() {
    if (!iniciar()) return;
    try { await refrescarLista(); } finally { terminar(); }
  }
  async function crear() {
    if (!vigente.current || bloqueo.current || seleccion.current.planificacionId || seleccion.current.carreraId !== carreraId) return;
    if (!carrera || !codigoValido || codigo !== codigoVigente.current) return;
    if (!iniciar()) return;
    setCreando(true);
    try {
      const creada = await servicio.crear({ carreraId: carrera.id, codigo });
      if (!vigente.current) return;
      // Keep the confirmed result if the subsequent GET fails; never repeat POST.
      setPlanificaciones(filas => [...(filas ?? []).filter(fila => fila.id !== creada.id).map(fila =>
        fila.carreraId === creada.carreraId ? { ...fila, actual: false } : fila), { ...creada, carrera }]);
      setCarreraId(String(creada.carreraId)); setPlanificacionId(String(creada.id)); cambiarCodigo('');
      seleccion.current = { carreraId: String(creada.carreraId), planificacionId: String(creada.id) };
      notificaciones.exito(`Período ${creada.codigo} creado como actual y en Preparación para ${carrera.nombre}.`);
      await refrescarLista();
    } catch (fallo) {
      if (vigente.current) notificaciones.error(fallo instanceof Error ? fallo.message : 'No se pudo confirmar la creación del período.');
    } finally {
      if (vigente.current) setCreando(false);
      terminar();
    }
  }
  async function actualizada(fila: Omit<PlanificacionSemestre, 'carrera'>) {
    if (!vigente.current) return;
    setPlanificaciones(filas => (filas ?? []).map(periodo => periodo.carreraId !== fila.carreraId ? periodo
      : { ...periodo, ...(periodo.id === fila.id ? fila : {}), actual: periodo.id === fila.id }));
    notificaciones.exito(`Período ${fila.codigo} marcado como actual. Su estado y sus datos se conservan.`);
    await refrescarLista();
  }
  function estadoCambiado(id: number, estado: EstadoPeriodo) {
    if (!vigente.current) return;
    setPlanificaciones(filas => filas?.map(periodo => periodo.id === id
      ? { ...periodo, estadoPlanificacion: estado } : periodo) ?? null);
  }
  async function eliminada(id: number, codigo: string) {
    if (!vigente.current) return;
    setPlanificaciones(filas => (filas ?? []).filter(periodo => periodo.id !== id));
    seleccion.current.planificacionId = ''; setPlanificacionId(''); cambiarCodigo('');
    // The parent owns this outcome because clearing selection unmounts the panel.
    notificaciones.exito(`Período ${codigo} eliminado. No se ha marcado otro período como actual.`);
    await refrescarLista();
  }
  const planificacion = planificaciones?.find(fila => fila.id === Number(planificacionId) && fila.carreraId === Number(carreraId));
  return <div className={estilos.pagina}>
    <section className={base.pagina} aria-labelledby="titulo-administracion">
      <h1 id="titulo-administracion">Administración de períodos</h1>
      <p className={estilos.descripcion}>Selecciona una carrera y un período para cambiar su estado o reiniciar datos.</p>
      {!planificaciones && !error && <p role="status">Cargando períodos…</p>}
      {error && <div role="alert" className={base.error}>{error} <button onClick={() => setIntento(valor => valor + 1)}>Reintentar</button></div>}
      {planificaciones?.length === 0 && <p>No hay períodos registrados.</p>}
      {carreras?.length === 0 && <p>No hay carreras registradas.</p>}
      {carreras && planificaciones &&
      <fieldset disabled={ocupado} className={base.campos}>
        <legend className={base.soloLectores}>Carrera</legend>
        <div className={base.filtros}>
          <label>Carrera<select value={carreraId} onChange={evento => {
            if (bloqueo.current) return;
            seleccion.current = { carreraId: evento.target.value, planificacionId: '' };
            setCarreraId(evento.target.value); setPlanificacionId(''); cambiarCodigo('');
          }}>
            <option value="">Selecciona una carrera</option>
            {carreras.map(carrera => <option key={carrera.id} value={carrera.id}>{carrera.nombre}</option>)}
          </select></label>
        </div>
      </fieldset>}
    </section>
    {carreras && planificaciones && <div className={estilos.seleccionCreacion}>
      <section className={base.pagina} aria-labelledby="titulo-seleccion">
        <h2 id="titulo-seleccion">Seleccionar período a editar</h2>
        <fieldset disabled={ocupado} className={base.campos}>
          <legend className={base.soloLectores}>Período de la carrera seleccionada</legend>
          <SelectorPeriodo key={carreraId} deshabilitado={ocupado || !carreraId} valor={planificacionId}
            periodos={planificaciones.filter(fila => fila.carreraId === Number(carreraId))} alSeleccionar={valor => {
              if (!vigente.current || bloqueo.current || !carreraId || seleccion.current.carreraId !== carreraId) return;
              if (valor && !planificaciones.some(fila => String(fila.id) === valor && fila.carreraId === Number(carreraId))) return;
              seleccion.current.planificacionId = valor;
              setPlanificacionId(valor); cambiarCodigo('');
            }} />
        </fieldset>
        <p>Selecciona un período existente para gestionarlo</p>
      </section>
      <section aria-labelledby="titulo-creacion" className={`${base.pagina} ${estilos.creacion} ${planificacionId ? estilos.creacionDeshabilitada : ''}`}>
        <h2 id="titulo-creacion">Crear período</h2>
        <form aria-labelledby="titulo-creacion" onSubmit={evento => { evento.preventDefault(); void crear(); }}>
          <fieldset disabled={ocupado || !carreraId || !!planificacionId} className={base.campos}>
            <legend className={base.soloLectores}>Nuevo período para la carrera seleccionada</legend>
            <label>Código del período<input value={codigo} onChange={evento => cambiarCodigo(evento.target.value)}
              required minLength={6} maxLength={6} pattern="[0-9]{4}-[12]" placeholder="2027-1" aria-describedby="ayuda-creacion" /></label>
            <div className={`${base.acciones} ${estilos.accionesCreacion}`}>
              <button type="submit" disabled={ocupado || !carrera || !codigoValido || !!planificacionId}>{creando ? 'Creando período…' : 'Crear período'}</button>
              <span id="ayuda-creacion">Se creará como actual.</span>
            </div>
          </fieldset>
        </form>
      </section>
    </div>}
    {errorLista && <div role="alert" className={base.error}>{errorLista} <button disabled={ocupado} onClick={() => void actualizar()}>Actualizar períodos</button></div>}
    {planificacion && <PanelPeriodo key={planificacion.id} planificacion={planificacion} bloqueado={ocupado}
      alIniciar={() => seleccion.current.planificacionId === String(planificacion.id) && iniciar()} alTerminar={terminar}
      alActualizada={actualizada} alEstadoCambiado={estadoCambiado} alEliminada={eliminada} />}
  </div>;
}

function PanelPeriodo({ planificacion, bloqueado, alIniciar, alTerminar, alActualizada, alEstadoCambiado, alEliminada }: {
  planificacion: PlanificacionSemestre; bloqueado: boolean; alIniciar: () => boolean; alTerminar: () => void;
  alActualizada: (fila: Omit<PlanificacionSemestre, 'carrera'>) => Promise<void>;
  alEstadoCambiado: (id: number, estado: EstadoPeriodo) => void;
  alEliminada: (id: number, codigo: string) => Promise<void>;
}) {
  const [resumenes, setResumenes] = useState<ResumenesPeriodo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [accion, setAccion] = useState<AccionReinicio | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [confirmacionEliminacion, setConfirmacionEliminacion] = useState<string | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoPeriodo>(planificacion.estadoPlanificacion);
  const vigente = useRef(true);
  const enviando = useRef(false);
  const consulta = useRef(0);
  const confirmacionVigente = useRef<string | null>(null);
  function confirmarEliminacion(texto: string | null) {
    confirmacionVigente.current = texto; setConfirmacionEliminacion(texto);
  }
  useEffect(() => {
    vigente.current = true;
    void cargar();
    return () => { vigente.current = false; consulta.current++; };
  }, []);
  async function cargar() {
    const revision = ++consulta.current;
    const actual = () => vigente.current && revision === consulta.current;
    setCargando(true); setResumenes(null); setAccion(null); setConfirmacion(''); confirmarEliminacion(null); setError('');
    try {
      const [gestionadas, externas, todas] = await Promise.all([
        servicio.resumen(planificacion.id, 'gestionadas'), servicio.resumen(planificacion.id, 'externas'), servicio.resumen(planificacion.id, 'todas'),
      ]);
      if (actual()) { setResumenes({ gestionadas, externas, todas }); setNuevoEstado(todas.planificacion.estadoPlanificacion); }
    } catch (fallo) {
      if (actual()) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el período.');
    } finally { if (actual()) setCargando(false); }
  }
  async function reintentar() {
    if (!vigente.current || enviando.current || !alIniciar()) return;
    enviando.current = true;
    try { await cargar(); }
    finally { enviando.current = false; alTerminar(); }
  }
  async function ejecutar(accion: () => Promise<string | void>, recargar = true) {
    if (!vigente.current || enviando.current || !alIniciar()) return;
    enviando.current = true; setOcupado(true);
    consulta.current++; setResumenes(null); setAccion(null); setConfirmacion(''); confirmarEliminacion(null);
    let completada = false;
    try {
      const texto = await accion();
      completada = true;
      if (vigente.current && texto) notificaciones.exito(texto);
    } catch (fallo) {
      if (vigente.current) notificaciones.error(`${fallo instanceof Error ? fallo.message : 'No se pudo confirmar la operación.'} Revisa los datos actualizados antes de reintentar.`);
    } finally {
      try { if (vigente.current && (recargar || !completada)) await cargar(); }
      finally {
        enviando.current = false;
        if (vigente.current) setOcupado(false);
        // Deletion unmounts this panel before GET finishes. The parent still
        // owns the lock and must always receive its release.
        alTerminar();
      }
    }
  }
  function reiniciar() {
    if (!resumenes || !accion) return;
    const resumen = resumenes[accion.alcance];
    if (!puedeReiniciar(accion, resumen) || !confirmarReinicio(resumen, planificacion.id, accion.alcance, confirmacion)) return;
    void ejecutar(async () => {
      const resultado = await servicio.reiniciar(planificacion.id, { alcance: accion.alcance, objetivo: accion.objetivo, confirmacion, huella: resumen.huella });
      return `Reinicio completado: ${resultado.ofertas} ofertas, ${resultado.asignaciones} asignaciones y ${resultado.horarios} bloques eliminados.`;
    });
  }
  function cambiarEstado() {
    if (!resumenes) return;
    const { planificacion: actual } = resumenes.todas;
    if (!puedeCambiarEstado(actual.estadoPlanificacion, nuevoEstado, resumenes.gestionadas.horarios)) return;
    void ejecutar(async () => {
      await servicio.cambiarEstado(planificacion.id, actual.estadoPlanificacion, nuevoEstado);
      if (vigente.current) alEstadoCambiado(planificacion.id, nuevoEstado);
      return `Estado cambiado a ${estadosPeriodo[nuevoEstado]}.`;
    });
  }
  function marcarActual() {
    if (!resumenes || resumenes.todas.planificacion.id !== planificacion.id || resumenes.todas.planificacion.actual) return;
    void ejecutar(async () => {
      const fila = await servicio.marcarActual(planificacion.id);
      await alActualizada(fila);
    });
  }
  function eliminar() {
    const codigoConfirmado = confirmacionVigente.current;
    if (!resumenes || codigoConfirmado === null || !puedeEliminarPeriodo(resumenes.todas, planificacion.id)
      || !confirmarReinicio(resumenes.todas, planificacion.id, 'todas', codigoConfirmado)) return;
    void ejecutar(async () => {
      await servicio.eliminar(planificacion.id, codigoConfirmado);
      await alEliminada(planificacion.id, codigoConfirmado);
    }, false);
  }
  return <>
    {error && <div role="alert" className={base.error}>{error} <button disabled={ocupado || cargando || bloqueado} onClick={() => void reintentar()}>Reintentar</button></div>}
    {cargando && <p role="status">Cargando período…</p>}
    {resumenes && <VistaPeriodo resumenes={resumenes} nuevoEstado={nuevoEstado} accion={accion} confirmacion={confirmacion}
      bloqueado={ocupado || cargando || bloqueado} alNuevoEstado={setNuevoEstado} alSeleccionarAccion={opcion => { setAccion(opcion); setConfirmacion(''); confirmarEliminacion(null); }}
      alConfirmacion={setConfirmacion} alReiniciar={reiniciar} alCancelar={() => { setAccion(null); setConfirmacion(''); }} alCambiarEstado={cambiarEstado}
      alMarcarActual={marcarActual} alEliminar={eliminar} confirmacionEliminacion={confirmacionEliminacion}
      alSolicitarEliminacion={() => {
        if (enviando.current || bloqueado || !puedeEliminarPeriodo(resumenes.todas, planificacion.id)) return;
        setAccion(null); setConfirmacion(''); confirmarEliminacion('');
      }} alConfirmacionEliminacion={texto => { if (confirmacionVigente.current !== null) confirmarEliminacion(texto); }} alCancelarEliminacion={() => confirmarEliminacion(null)} />}
  </>;
}
