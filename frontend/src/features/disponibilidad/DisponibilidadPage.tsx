import { useEffect, useReducer, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { estadoSecciones, ordenarPeriodosPorFechaAcademica } from '../../lib/periodos';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';
import { disponibilidadApi } from './disponibilidad.api';
import { estadoInicial, planificacionesActuales, puedeEnviar, puedeRegistrarDisponibilidad, reducirDisponibilidad } from './estado';
import type { Bloque, Planificacion } from './types';
import GrillaDisponibilidad from './GrillaDisponibilidad';
import horario from '../mi-horario/MiHorario.module.css';
import estilos from './Disponibilidad.module.css';
import iconoEnviar from '../../assets/iconos/Enviar.svg';
import iconoEditar from '../../assets/iconos/editar_Asignatura.svg';
import iconoMarcarTodo from '../../assets/iconos/marcar-todo.svg';
import { parejaUtilizable } from './parejas';

export function RequireDisponibilidad() {
  const { usuario } = useAuth();
  return puedeRegistrarDisponibilidad(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}

function mensajeError(fallo: unknown) {
  if (fallo instanceof ApiError) return fallo.message;
  return 'No se pudo cargar o enviar la disponibilidad. Inténtalo nuevamente.';
}

export default function DisponibilidadPage() {
  const { usuario } = useAuth();
  const [planificaciones, setPlanificaciones] = useState<Planificacion[] | null>(null);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [planificacionId, setPlanificacionId] = useState<number | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorSeguimiento, setErrorSeguimiento] = useState('');
  const [intento, setIntento] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const [estado, dispatch] = useReducer(reducirDisponibilidad, estadoInicial);
  const enviando = useRef(false);
  const generacion = useRef(0);

  useEffect(() => {
    const controlador = new AbortController();
    let activo = true;
    setPlanificaciones(null);
    setPlanificacionId(null);
    setErrorCarga('');
    dispatch({ tipo: 'consultar', id: null });
    disponibilidadApi.consultar(undefined, controlador.signal).then(datos => {
      if (!activo) return;
      const actuales = planificacionesActuales(datos.planificaciones);
      setPlanificaciones(actuales);
      setBloques(datos.bloques);
      if (actuales.length > 0) {
        dispatch({ tipo: 'consultar', id: actuales[0].id });
        setPlanificacionId(actuales[0].id);
      }
    }).catch(fallo => { if (activo) setErrorCarga(mensajeError(fallo)); });
    return () => { activo = false; controlador.abort(); generacion.current++; };
  }, [intento, usuario?.id]);

  useEffect(() => {
    if (planificacionId === null) return;
    const id = planificacionId;
    const controlador = new AbortController();
    let activo = true;
    dispatch({ tipo: 'consultar', id });
    disponibilidadApi.consultar(id, controlador.signal).then(datos => {
      if (!activo) return;
      const actuales = planificacionesActuales(datos.planificaciones);
      setPlanificaciones(actuales);
      setBloques(datos.bloques);
      const planificacion = actuales.find(p => p.id === id);
      if (!datos.seleccion || !planificacion) {
        dispatch({ tipo: 'fallo', id, mensaje: 'Esta planificación ya no está disponible. Selecciona otra carrera y período.' });
        return;
      }
      dispatch({ tipo: 'cargada', id, seleccion: { ...datos.seleccion,
        editable: datos.seleccion.editable && planificacion.estadoPlanificacion === 'preparacion' } });
    }).catch(fallo => { if (activo) dispatch({ tipo: 'fallo', id, mensaje: mensajeError(fallo) }); });
    return () => { activo = false; controlador.abort(); generacion.current++; };
  }, [planificacionId, recarga]);

  useEffect(() => {
    if (planificacionId === null) return;
    const id = planificacionId;
    let activo = true;
    const controlador = new AbortController();
    let temporizador: ReturnType<typeof setTimeout>;
    setErrorSeguimiento('');
    async function consultarPermiso() {
      try {
        if (!enviando.current) {
          const datos = await disponibilidadApi.consultar(id, controlador.signal);
          if (!activo) return;
          const planificacion = datos.planificaciones.find(p => p.id === id && p.actual);
          dispatch({ tipo: 'permiso', id, editable: datos.seleccion?.editable === true && planificacion?.estadoPlanificacion === 'preparacion',
            bloqueadaPorOptimizacion: datos.seleccion?.bloqueadaPorOptimizacion === true,
            bloquesReservadosIds: datos.seleccion?.bloquesReservadosIds });
          setErrorSeguimiento('');
        }
      } catch (fallo) {
        if (activo) setErrorSeguimiento(`No se pudo actualizar el permiso de edición. ${mensajeError(fallo)} El borrador se conserva.`);
      } finally { if (activo) temporizador = setTimeout(() => { void consultarPermiso(); }, 5000); }
    }
    temporizador = setTimeout(() => { void consultarPermiso(); }, 5000);
    return () => { activo = false; clearTimeout(temporizador); controlador.abort(); };
  }, [planificacionId, recarga]);

  async function enviar() {
    if (enviando.current || errorSeguimiento || !puedeEnviar(estado) || estado.id === null) return;
    const id = estado.id;
    const numero = generacion.current;
    enviando.current = true;
    dispatch({ tipo: 'enviar' });
    try {
      const seleccion = await disponibilidadApi.enviar(id, estado.bloquesIds);
      if (numero === generacion.current) dispatch({ tipo: 'guardada', id, seleccion });
    } catch (fallo) {
      if (numero === generacion.current) {
        dispatch({ tipo: 'fallo', id, mensaje: mensajeError(fallo) });
        // Actualizar restricciones y excluir reservas nuevas solo del borrador, sin reenviar.
        try {
          const datos = await disponibilidadApi.consultar(id);
          if (numero === generacion.current) {
            const planificacion = datos.planificaciones.find(p => p.id === id && p.actual);
            dispatch({ tipo: 'permiso', id, editable: datos.seleccion?.editable === true
               && planificacion?.estadoPlanificacion === 'preparacion',
              bloqueadaPorOptimizacion: datos.seleccion?.bloqueadaPorOptimizacion === true,
              bloquesReservadosIds: datos.seleccion?.bloquesReservadosIds });
          }
        } catch { /* Conservar el borrador y el error original si falla la consulta. */ }
      }
    } finally { enviando.current = false; }
  }

  const seleccion = estado.seleccion;
  const planificacionSeleccionada = planificaciones?.find(p => p.id === planificacionId);
  const guardando = estado.modo === 'enviando';
  const reservados = seleccion?.bloquesReservadosIds ?? [];
  const utilizables = bloques.filter(bloque => parejaUtilizable(bloques, bloque.id, reservados));
  const capacidadInsuficiente = seleccion !== null && utilizables.length < seleccion.minimoBloques;
  const todosSeleccionados = utilizables.length > 0 && utilizables.every(bloque => estado.bloquesIds.includes(bloque.id));
  return <section className={estilos.pagina} aria-labelledby="titulo-disponibilidad">
    <header className={estilos.encabezado}><h1 id="titulo-disponibilidad">Mi disponibilidad</h1>
      <p>Marca los bloques en que puedes impartir clases y envía tu disponibilidad.</p>
      <p className={estilos.ayuda}>Se seleccionan por parejas del mismo día: 1–2, 3–4 y así sucesivamente. Si uno está reservado, la pareja queda bloqueada.</p></header>
    {errorCarga && <p role="alert">{errorCarga}</p>}
    {planificaciones === null ? errorCarga
      ? <button type="button" className="boton boton--azul" onClick={() => setIntento(i => i + 1)}>Reintentar</button>
      : <p role="status">Cargando disponibilidad…</p>
      : planificaciones.length === 0 ? <p>No tienes carga docente asignada en el período actual.</p>
      : <>
        <div className={estilos.contexto}>
          <label className={estilos.selector}>Carrera y período<select value={planificacionId ?? ''} disabled={guardando}
            onChange={evento => {
              if (enviando.current) return;
              const id = evento.target.value ? Number(evento.target.value) : null;
              generacion.current++;
              dispatch({ tipo: 'consultar', id });
              setErrorCarga('');
              setPlanificacionId(id);
            }}>
            {ordenarPeriodosPorFechaAcademica(planificaciones).map(p => <option key={p.id} value={p.id}>{p.carreraNombre} — {p.codigo} — {estadoSecciones(p).etiqueta}</option>)}
          </select></label>
          {planificacionSeleccionada && <span className={`${horario.estado} ${planificacionSeleccionada.estadoPlanificacion === 'publicado' ? horario.publicado
            : planificacionSeleccionada.estadoPlanificacion === 'propuesta' ? horario.propuesta : horario.preparacion}`}>
            Estado del período: {estadoSecciones(planificacionSeleccionada).etiqueta}
          </span>}
        </div>
        <div className={estilos.panelGrilla}>
          {seleccion && <div className={estilos.cabeceraGrilla}>
            <div>
              <p id="conteo-disponibilidad">Seleccionados: <strong>{estado.bloquesIds.filter(id => !reservados.includes(id)).length}</strong> / mínimo {seleccion.minimoBloques} bloques.</p>
              <p className={estilos.ayuda}>Seleccionar más bloques facilita la generación del horario.</p>
              <p className={`${estilos.ayuda} ${estilos.ayudaMouse}`}>Con el mouse, mantén presionado y arrastra para marcar o desmarcar varios bloques.</p>
            </div>
            <details key={seleccion.planificacionSemestreId} className={estilos.carga}>
              <summary><span className={estilos.resumenCarga}>
                <span>Carga docente</span><strong>{seleccion.minimoBloques} bloques requeridos</strong>
              </span></summary>
              <div className={estilos.detalleCarga}>
                <ul>{seleccion.carga.map(c => <li key={`${c.ofertaId}-${c.tipoHoraId}`}>
                  {c.asignaturaCodigo} — {c.asignaturaNombre}, sección {c.seccion}, {c.tipoHoraNombre}: <strong>{c.horas} bloques</strong>
                </li>)}</ul>
              </div>
            </details>
          </div>}
          <div className={estilos.cuerpoGrilla}>
          {planificacionId === null ? <p>Selecciona una carrera y período para registrar tu disponibilidad.</p>
            : estado.modo === 'cargando' ? <p role="status">Cargando planilla…</p> : null}
          {estado.error && <p role="alert">{estado.error}</p>}
          {errorSeguimiento && <p role="alert">{errorSeguimiento}</p>}
          {seleccion?.bloqueadaPorOptimizacion && <p role="status">Edición bloqueada durante el cálculo del modelo. Puedes consultar la grilla, tu borrador se conserva hasta que termine.</p>}
          {estado.modo === 'error' && <button type="button" className="boton boton--azul" onClick={() => setRecarga(i => i + 1)}>Reintentar</button>}
          {seleccion && <>
            {reservados.length > 0 && <p>Los bloques reservados pertenecen a esta carrera. Sus parejas no se pueden seleccionar, las reservas no cuentan para el mínimo.</p>}
            {capacidadInsuficiente && <p role="alert">{`La capacidad utilizable es de ${utilizables.length} ${utilizables.length === 1 ? 'bloque' : 'bloques'} y no cubre el mínimo de ${seleccion.minimoBloques}. Contacta a secretaría.`}</p>}
            {bloques.length === 0 ? <p>No hay bloques horarios disponibles.</p> : <GrillaDisponibilidad key={planificacionId} bloques={bloques}
              bloquesIds={estado.bloquesIds} bloquesReservadosIds={reservados} bloqueada={estado.modo !== 'edicion' || !seleccion.editable || Boolean(errorSeguimiento)}
              guardada={estado.modo === 'guardada'} alternar={id => dispatch({ tipo: 'alternar', id })} />}
          </>}
          </div>
          {seleccion && <footer className={estilos.pieGrilla}>
            <div>
            <p className={estado.modo === 'edicion' && seleccion.editable ? estilos.pendiente : estilos.estadoEnvio} role="status" aria-live="polite">{guardando ? 'Enviando disponibilidad…'
              : seleccion.bloqueadaPorOptimizacion ? 'Solo lectura durante el cálculo del modelo.'
              : !seleccion.editable ? 'Solo lectura: la planificación ya no admite cambios.'
               : estado.modo === 'guardada' ? 'Disponibilidad enviada.'
               : 'Selección sin enviar.'}</p>
            </div>
            <div className={estilos.acciones} role="group" aria-label="Acciones de disponibilidad">
              {estado.modo === 'edicion' && seleccion.editable && <button type="button" className={`boton boton--gris ${estilos.botonConIcono}`}
                disabled={Boolean(errorSeguimiento) || utilizables.length === 0}
                onClick={() => dispatch(todosSeleccionados ? { tipo: 'deseleccionar_todos' }
                  : { tipo: 'seleccionar_todos', bloquesIds: utilizables.map(bloque => bloque.id) })}>
                <span className={estilos.iconoAccion} aria-hidden="true"
                  style={{ maskImage: `url("${iconoMarcarTodo}")`, WebkitMaskImage: `url("${iconoMarcarTodo}")` }} />
                {todosSeleccionados ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>}
              {seleccion.editable && (estado.modo === 'guardada'
                ? <button type="button" className={`boton boton--editar ${estilos.botonConIcono}`} disabled={Boolean(errorSeguimiento)} onClick={() => dispatch({ tipo: 'editar' })}>
                    <span className={estilos.iconoAccion} aria-hidden="true"
                      style={{ maskImage: `url("${iconoEditar}")`, WebkitMaskImage: `url("${iconoEditar}")` }} />
                    Editar disponibilidad</button>
                : <>
                  <button type="button" className={`boton boton--azul ${estilos.botonConIcono}`} disabled={!puedeEnviar(estado) || Boolean(errorSeguimiento) || capacidadInsuficiente || bloques.length === 0}
                    aria-describedby="conteo-disponibilidad" onClick={enviar}>
                    <span className={estilos.iconoAccion} aria-hidden="true"
                      style={{ maskImage: `url("${iconoEnviar}")`, WebkitMaskImage: `url("${iconoEnviar}")` }} />
                    {guardando ? 'Enviando…' : 'Enviar disponibilidad'}</button>
                  {seleccion.bloquesIds.length > 0 && <button type="button" className="boton boton--gris" disabled={guardando}
                    onClick={() => dispatch({ tipo: 'cancelar' })}>Cancelar edición</button>}
                </>)}
            </div>
          </footer>}
        </div>
      </>}
  </section>;
}
