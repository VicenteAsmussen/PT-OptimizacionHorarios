import { useEffect, useReducer, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';
import { notificaciones } from '../../lib/notificaciones';
import { planificacionInicial, estadoSecciones } from '../asignaturas/datos';
import { resultadosHorariosApi } from './resultados-horarios.api';
import { claveMovimiento, estadoDestino, estadoInicial, gruposMovibles, puedeConfirmarMovimiento, puedeEditarResultado, puedeMoverSesion, reducirResultados, sesionesVisibles } from './modelo';
import { puedeGestionarResultados } from './permisos';
import type { ErrorPlanilla, Movimiento, PlanificacionSemestre, ResultadoHorario, SesionResultado, ValidacionMovimiento } from './types';
import CalendarioResultados from './CalendarioResultados';
import GestionSalas from './GestionSalas';
import ControlesMovimiento from './ControlesMovimiento';
import PublicacionDialogo from './PublicacionDialogo';
import estilos from './ResultadosHorarios.module.css';

export function RequireResultadosHorarios() {
  const { usuario } = useAuth();
  return puedeGestionarResultados(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}
export default function ResultadosHorariosPage() {
  const { usuario } = useAuth();
  return <ConsultaResultados key={usuario?.id} />;
}
const mensajeError = (fallo: unknown) => fallo instanceof Error ? fallo.message : 'No se pudo completar la solicitud.';
function erroresPlanilla(fallo: unknown): ErrorPlanilla[] {
  const detalle = fallo instanceof ApiError ? fallo.detalle : null;
  if (!detalle || typeof detalle !== 'object' || !('errores' in detalle) || !Array.isArray(detalle.errores)) return [];
  return detalle.errores.filter((e): e is ErrorPlanilla => e && typeof e === 'object'
    && typeof e.fila === 'number' && typeof e.columna === 'string' && typeof e.mensaje === 'string');
}

export function ConsultaResultados() {
  const [planificaciones, setPlanificaciones] = useState<PlanificacionSemestre[] | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let activo = true;
    const controlador = new AbortController();
    setError(''); setPlanificaciones(null); setId(null);
    resultadosHorariosApi.planificaciones(controlador.signal).then(datos => {
      if (activo) { setPlanificaciones(datos); setId(planificacionInicial(datos)); }
    }).catch(fallo => { if (activo) setError(mensajeError(fallo)); });
    return () => { activo = false; controlador.abort(); };
  }, [intento]);
  const planificacion = planificaciones?.find(p => p.id === id);
  return <section className={estilos.pagina} aria-labelledby="titulo-resultados">
    <header className={estilos.tarjeta}>
      <h1 id="titulo-resultados" tabIndex={-1}>Gestión del horario</h1>
      <p>Revisa la propuesta semanal de la carrera, ajusta sesiones, gestiona salas y publica el horario.</p>
      <div className={estilos.controles}><label>Carrera y período<select value={id ?? ''} disabled={ocupado || !planificaciones}
        onChange={evento => { if (!ocupado) setId(evento.target.value ? Number(evento.target.value) : null); }}>
        <option value="">Seleccionar carrera y período</option>
        {planificaciones?.map(p => <option key={p.id} value={p.id}>{p.carrera.nombre} · {p.codigo} · {estadoSecciones(p).etiqueta}{p.actual ? ' · Actual' : ''}</option>)}
      </select></label></div>
    </header>
    {error ? <div className={estilos.tarjeta}><p role="alert">{error}</p><button type="button" className="boton" onClick={() => setIntento(i => i + 1)}>Reintentar</button></div>
      : !planificaciones ? <p role="status">Cargando planificaciones…</p>
      : planificaciones.length === 0 ? <p role="status">No hay planificaciones disponibles para tu carrera.</p>
      : !planificacion ? <p role="status">Selecciona una carrera y un período para consultar el horario.</p>
      : planificacion.estadoPlanificacion === 'preparacion' ? <p className={estilos.tarjeta} role="status">Este período está en Preparación. Todavía no hay una propuesta habilitada para gestionar. La ejecución del modelo se realiza fuera de esta página.</p>
      : <ContenidoResultados key={planificacion.id} id={planificacion.id} ocupado={ocupado} cambiarOcupado={setOcupado}
          actualizarPlanificacion={datos => setPlanificaciones(actuales => actuales?.map(p => p.id === datos.id ? { ...p, ...datos } : p) ?? null)} />}
  </section>;
}

export function ContenidoResultados({ id, ocupado, cambiarOcupado, actualizarPlanificacion }: {
  id: number; ocupado: boolean; cambiarOcupado: (valor: boolean) => void;
  actualizarPlanificacion: (datos: ResultadoHorario['planificacion']) => void;
}) {
  const [estado, dispatch] = useReducer(reducirResultados, { ...estadoInicial, id });
  const [nivel, setNivel] = useState('1');
  const [seleccionada, setSeleccionada] = useState<SesionResultado | null>(null);
  const [grupo, setGrupo] = useState(0);
  const [destino, setDestino] = useState(0);
  const [edicion, setEdicion] = useState(0);
  const [validacion, setValidacion] = useState<ValidacionMovimiento | null>(null);
  const [errorMovimiento, setErrorMovimiento] = useState('');
  const [publicando, setPublicando] = useState(false);
  const avisoActual = useRef<string | number | null>(null);
  const [errores, setErrores] = useState<ErrorPlanilla[]>([]);
  const [descargando, setDescargando] = useState(false);
  const descarga = useRef<AbortController | null>(null);
  const bloqueo = useRef(false);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; descarga.current?.abort(); cerrarAviso(); }; }, []);
  useEffect(() => {
    let activo = true;
    const controlador = new AbortController();
    const secuencia = estado.secuencia;
    resultadosHorariosApi.consultar(id, controlador.signal).then(resultado => {
      if (activo && resultado.planificacion.id === id) {
        dispatch({ tipo: 'cargado', secuencia, resultado });
        actualizarPlanificacion(resultado.planificacion);
      }
    }).catch(fallo => { if (activo) dispatch({ tipo: 'fallo', secuencia, mensaje: mensajeError(fallo) }); });
    return () => { activo = false; controlador.abort(); };
  }, [id, estado.secuencia]);
  const resultado = estado.resultado;
  const sesionActual = resultado?.sesiones.find(s => s.idsHorarios.join(',') === seleccionada?.idsHorarios.join(','));
  const sesionMovimiento = resultado && sesionActual && puedeMoverSesion(resultado, sesionActual) ? sesionActual : null;
  const datos: Movimiento = { revision: resultado?.revision ?? '', idsHorarios: sesionMovimiento && resultado ? gruposMovibles(sesionMovimiento, resultado.bloques)[grupo] ?? [] : [], bloqueInicioId: destino };
  const clave = claveMovimiento(id, datos);
  const disponible = Boolean(resultado && sesionMovimiento && estadoDestino(resultado, sesionMovimiento, destino, datos.idsHorarios.length) === 'disponible');
  const visible = validacion?.clave === clave ? validacion : null;
  const aprobado = Boolean(resultado && sesionMovimiento && puedeConfirmarMovimiento(resultado, sesionMovimiento, datos, visible));
  useEffect(() => {
    setValidacion(null); setErrorMovimiento('');
    if (!sesionMovimiento || !destino || !disponible || ocupado) return;
    let activo = true;
    const controlador = new AbortController();
    resultadosHorariosApi.validarMovimiento(id, datos, controlador.signal).then(respuesta => {
      if (activo) setValidacion({ ...respuesta, clave });
    }).catch(fallo => { if (activo) setErrorMovimiento(mensajeError(fallo)); });
    return () => { activo = false; controlador.abort(); };
  }, [clave, sesionMovimiento?.idsHorarios.join(','), disponible, ocupado, edicion]);
  function cancelarMovimiento() {
    if (bloqueo.current) return;
    setSeleccionada(null); setGrupo(0); setDestino(0); setValidacion(null); setErrorMovimiento(''); setEdicion(e => e + 1);
  }
  function seleccionarSesion(sesion: SesionResultado) {
    if (!resultado || bloqueo.current) return;
    const actual = resultado.sesiones.find(s => s.idsHorarios.join(',') === sesion.idsHorarios.join(','));
    if (!actual || !puedeMoverSesion(resultado, actual)) return;
    cancelarMovimiento(); setSeleccionada(actual); setNivel(String(actual.asignatura.semestreMalla)); setPublicando(false);
  }
  function elegirDestino(inicioId: number) {
    if (bloqueo.current || inicioId === destino) return;
    const inicio = resultado?.bloques.find(b => b.id === inicioId);
    if (!inicio || inicio.numeroBloque % 2 === 0) return;
    setValidacion(null); setErrorMovimiento(''); setDestino(inicioId);
  }
  function cambiarGrupo(indice: number) {
    if (bloqueo.current) return;
    setGrupo(indice); setDestino(0); setValidacion(null); setErrorMovimiento('');
  }
  function confirmarMovimiento() {
    if (!resultado || !sesionMovimiento || !puedeConfirmarMovimiento(resultado, sesionMovimiento, datos, visible)) return;
    void ejecutar(async () => ({ resultado: await resultadosHorariosApi.mover(id, datos), mensaje: 'Horario actualizado.' }));
  }
  function cerrarAviso() {
    if (avisoActual.current === null) return;
    notificaciones.cerrar(avisoActual.current); avisoActual.current = null;
  }
  function mostrarAviso(tipo: 'exito' | 'error' | 'advertencia', mensaje: string) {
    if (!vivo.current) return;
    avisoActual.current = notificaciones[tipo](mensaje, avisoActual.current ?? undefined);
  }
  function recargar() {
    setSeleccionada(null); setPublicando(false); dispatch({ tipo: 'seleccionar', id });
  }
  function actualizar() {
    cerrarAviso(); recargar();
  }
  async function ejecutar(operacion: () => Promise<{ resultado?: ResultadoHorario; mensaje: string }>) {
    if (!resultado || !puedeEditarResultado(resultado) || bloqueo.current) return;
    bloqueo.current = true; cambiarOcupado(true); cerrarAviso(); setErrores([]);
    try {
      const respuesta = await operacion();
      if (!vivo.current) return;
      setSeleccionada(null); setPublicando(false); mostrarAviso('exito', respuesta.mensaje);
      if (respuesta.resultado) {
        dispatch({ tipo: 'cargado', secuencia: estado.secuencia, resultado: respuesta.resultado });
        actualizarPlanificacion(respuesta.resultado.planificacion);
      } else recargar();
    } catch (fallo) {
      if (!vivo.current) return;
      mostrarAviso('error', 'No pudimos confirmar el cambio. Estamos revisando el horario.');
      setErrores(erroresPlanilla(fallo)); recargar();
    } finally {
      bloqueo.current = false;
      if (vivo.current) cambiarOcupado(false);
    }
  }
  async function exportar(soloPendientes: boolean) {
    if (bloqueo.current || !vivo.current) return;
    const controlador = new AbortController();
    descarga.current = controlador;
    bloqueo.current = true; cambiarOcupado(true); setDescargando(true); cerrarAviso();
    try {
      const archivo = await resultadosHorariosApi.exportar(id, soloPendientes, controlador.signal);
      if (!vivo.current || controlador.signal.aborted) return;
      const url = URL.createObjectURL(archivo);
      try {
        const enlace = document.createElement('a'); enlace.href = url;
        enlace.download = `solicitud-salas-${id}${soloPendientes ? '-pendientes' : ''}.xlsx`;
        document.body.append(enlace); enlace.click(); enlace.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
      mostrarAviso('exito', 'La solicitud de salas está lista.');
    } catch { if (vivo.current && !controlador.signal.aborted) mostrarAviso('error', 'No pudimos descargar el archivo. Intenta de nuevo.'); }
    finally {
      if (descarga.current === controlador) {
        descarga.current = null; bloqueo.current = false;
        if (vivo.current) { cambiarOcupado(false); setDescargando(false); }
      }
    }
  }
  function cancelarDescarga() {
    const controlador = descarga.current;
    if (!controlador) return;
    controlador.abort(); descarga.current = null; bloqueo.current = false;
    cambiarOcupado(false); setDescargando(false); mostrarAviso('advertencia', 'Descarga cancelada.');
  }
  return <>
    {descargando && <div className={estilos.tarjeta}>
      <p role="status">Descargando solicitud de salas…</p>
      <button type="button" className="boton" onClick={cancelarDescarga}>Cancelar descarga</button>
    </div>}
    {errores.length > 0 && <div className={`${estilos.tarjeta} ${estilos.erroresPlanilla}`} role="region" aria-label="Errores de la respuesta de salas" tabIndex={0}>
      <h2>Revisa la planilla antes de volver a importarla</h2><table><thead><tr><th scope="col">Fila</th><th scope="col">Columna</th><th scope="col">Problema</th></tr></thead>
        <tbody>{errores.map((e, i) => <tr key={i}><td>{e.fila}</td><td>{e.columna}</td><td>{e.mensaje}</td></tr>)}</tbody></table>
    </div>}
    {estado.error ? <div className={estilos.tarjeta}><p role="alert">{estado.error}</p><button type="button" className="boton" onClick={actualizar}>Reintentar consulta</button></div>
      : !resultado ? <p role="status">Cargando horario…</p> : <>
        <section className={estilos.tarjeta} aria-labelledby="titulo-semana">
          <h2 id="titulo-semana">Horario semanal de la carrera</h2>
          {!puedeEditarResultado(resultado) && <p>Solo lectura: únicamente se modifica la planificación actual en Propuesta. Los horarios externos permanecen fijos.</p>}
          <div className={estilos.controles}><button type="button" className="boton" disabled={ocupado} onClick={actualizar}>Actualizar horario</button>
            <span className={estilos.estado}>Estado: {estadoSecciones(resultado.planificacion).etiqueta}</span></div>
          <div className={estilos.semestres} role="group" aria-label="Semestres de la malla">
            {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(semestre => <button key={semestre} type="button"
              className={estilos.semestre} aria-label={`Ver semestre ${semestre}`} aria-pressed={nivel === semestre}
              disabled={ocupado} onClick={() => { if (!ocupado && semestre !== nivel) { cancelarMovimiento(); setNivel(semestre); } }}>{semestre}</button>)}
          </div>
          {sesionMovimiento && <ControlesMovimiento resultado={resultado} sesion={sesionMovimiento} grupo={grupo} datos={datos}
            validacion={visible} error={errorMovimiento} aprobado={aprobado} ocupado={ocupado}
            cambiarGrupo={cambiarGrupo} cancelar={cancelarMovimiento} confirmar={confirmarMovimiento} />}
          {sesionesVisibles(resultado, nivel).length === 0 ? <p role="status">No hay clases asignadas para el semestre {nivel}.</p>
            : <CalendarioResultados resultado={resultado} nivel={nivel} ocupado={ocupado} seleccionar={seleccionarSesion}
              movimiento={sesionMovimiento ? { sesion: sesionMovimiento, idsHorarios: datos.idsHorarios, cantidad: datos.idsHorarios.length, inicioId: destino,
                invalido: !disponible || visible?.valido === false || Boolean(errorMovimiento), elegir: elegirDestino } : undefined} />}
        </section>
        <GestionSalas key={resultado.revision} resultado={resultado} ocupado={ocupado || Boolean(sesionMovimiento)} seleccionar={seleccionarSesion} exportar={exportar}
          importar={archivo => { void ejecutar(async () => {
            const importacion = await resultadosHorariosApi.importar(id, resultado.revision, archivo);
            const cambios = importacion.actualizadas === 0 ? 'No hubo cambios.' : importacion.actualizadas === 1
              ? 'Se actualizó 1 sesión.' : `Se actualizaron ${importacion.actualizadas} sesiones.`;
            const pendientes = importacion.pendientes > 0
              ? ` ${importacion.pendientes === 1 ? 'Queda 1 sesión' : `Quedan ${importacion.pendientes} sesiones`} sin sala en el archivo.` : '';
            return { mensaje: `Archivo importado. ${cambios}${pendientes}` };
          }); }} />
        <section className={estilos.tarjeta} aria-labelledby="titulo-publicar"><h2 id="titulo-publicar">Publicación</h2>
          {puedeEditarResultado(resultado) ? <><p>Revisa los requisitos de toda la planificación antes de confirmar. Publicar bloquea la edición.</p>
            <button type="button" className="boton boton--azul" disabled={ocupado || Boolean(sesionMovimiento)} onClick={() => { if (!sesionMovimiento && !bloqueo.current) setPublicando(true); }}>Revisar y publicar</button></>
            : <p>Este horario es de solo lectura. La reapertura no está disponible.</p>}
        </section>
        {publicando && <PublicacionDialogo key={resultado.revision} resultado={resultado} ocupado={ocupado} cerrar={() => setPublicando(false)}
          confirmar={revision => { void ejecutar(async () => ({ resultado: await resultadosHorariosApi.publicar(id, revision), mensaje: 'Horario publicado. Ya no se puede editar.',
          })); }} />}
      </>}
  </>;
}
