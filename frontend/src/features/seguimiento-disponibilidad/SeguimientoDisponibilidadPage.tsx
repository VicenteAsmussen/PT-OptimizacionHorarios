import { useEffect, useReducer, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { planificacionInicial } from '../asignaturas/datos';
import type { PlanificacionSemestre } from '../asignaturas/types';
import { estadoEnvio, estadoInicial, puedeVerSeguimiento, reducirSeguimiento } from './estado';
import { seguimientoApi } from './seguimiento.api';
import base from '../asignaturas/Asignaturas.module.css';
import estilos from './SeguimientoDisponibilidad.module.css';
import IconoActualizar from '../../components/IconoActualizar';

export function RequireSeguimientoDisponibilidad() {
  const { usuario } = useAuth();
  return puedeVerSeguimiento(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}

export default function SeguimientoDisponibilidadPage() {
  const { usuario } = useAuth();
  return <PaginaSeguimiento key={`${usuario?.id}:${usuario?.rol}`} />;
}

function PaginaSeguimiento() {
  const [planificaciones, setPlanificaciones] = useState<PlanificacionSemestre[] | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [intento, setIntento] = useState(0);
  const [estado, enviar] = useReducer(reducirSeguimiento, estadoInicial);

  useEffect(() => {
    let activo = true;
    setPlanificaciones(null); setErrorCarga('');
    seguimientoApi.planificaciones().then(datos => {
      if (!activo) return;
      const actuales = datos.filter(planificacion => planificacion.actual);
      setPlanificaciones(actuales);
      enviar({ tipo: 'seleccionar', id: planificacionInicial(actuales) });
    }).catch(error => {
      if (activo) setErrorCarga(error instanceof Error ? error.message : 'No se pudieron cargar las planificaciones.');
    });
    return () => { activo = false; };
  }, [intento]);

  useEffect(() => {
    const id = estado.planificacionId;
    const revision = estado.revision;
    if (id === null) return;
    let activo = true;
    seguimientoApi.consultar(id).then(filas => {
      if (activo) enviar({ tipo: 'cargada', id, revision, filas });
    }).catch(error => {
      if (activo) enviar({ tipo: 'fallo', id, revision, mensaje: error instanceof Error ? error.message : 'No se pudo cargar el seguimiento.' });
    });
    return () => { activo = false; };
  }, [estado.planificacionId, estado.revision]);

  const enviadas = estado.filas?.filter(fila => fila.enviada).length ?? 0;
  return <div className={estilos.tarjetas}>
    <section className={base.pagina} aria-labelledby="titulo-seguimiento">
    <header className={base.cabecera}><div>
      <h1 id="titulo-seguimiento">Seguimiento de disponibilidad</h1>
      <p>Profesores con carga asignada en la planificación, solo de los departamentos que gestiona tu carrera.</p>
    </div></header>
    {!planificaciones && !errorCarga && <p role="status">Cargando planificaciones…</p>}
    {errorCarga && <div className={base.error} role="alert"><p>{errorCarga}</p>
      <button type="button" className="boton" onClick={() => setIntento(valor => valor + 1)}>Reintentar carga</button></div>}
    {planificaciones && (planificaciones.length === 0 ? <p className={base.estado}>No hay una planificación actual para consultar.</p> : <>
      <div className={base.filtros}>
        <label>Planificación / período
          <select value={estado.planificacionId ?? ''} onChange={evento => enviar({ tipo: 'seleccionar', id: evento.target.value ? Number(evento.target.value) : null })}>
            <option value="">Selecciona una planificación</option>
            {planificaciones.map(planificacion => <option key={planificacion.id} value={planificacion.id}>
              {planificacion.codigo} — {planificacion.carrera.nombre}
            </option>)}
          </select>
        </label>
        <div className={estilos.actualizar}><button type="button" className="boton" disabled={estado.planificacionId === null}
          onClick={() => enviar({ tipo: 'recargar' })}><IconoActualizar />Actualizar</button></div>
      </div>
      {estado.filas && <p role="status">{estado.filas.length} profesores · {enviadas} con disponibilidad enviada · {estado.filas.length - enviadas} sin enviar</p>}
    </>)}
    </section>
    {planificaciones && planificaciones.length > 0 && <section className={base.pagina} aria-label="Seguimiento de profesores">
      {estado.planificacionId === null ? <p className={base.estado}>Selecciona una planificación para ver a sus profesores.</p> : <>
        {estado.error && <div className={base.error} role="alert"><p>{estado.error}</p>
          <button type="button" className="boton" onClick={() => enviar({ tipo: 'recargar' })}>Reintentar consulta</button></div>}
        {!estado.filas && !estado.error && <p role="status">Cargando disponibilidad…</p>}
        {estado.filas && <>
          {estado.filas.length === 0 ? <p className={base.estado}>No hay profesores con carga asignada de tus departamentos gestionados en esta planificación.</p>
            : <div className={base.tablaContenedor} role="region" aria-label="Disponibilidad de profesores" tabIndex={0}>
              <table className={estilos.tabla}>
                <caption className={base.soloLectores}>Disponibilidad enviada por profesor y mínimo de bloques de la planificación seleccionada</caption>
                <thead><tr><th scope="col">Profesor</th><th scope="col">Departamento</th><th scope="col">Estado</th><th scope="col">Bloques enviados / mínimo</th></tr></thead>
                <tbody>{estado.filas.map(fila => <tr key={fila.profesorId}>
                  <th scope="row">{fila.nombre}</th><td>{fila.departamento.nombre}</td>
                  <td><span className={fila.enviada ? estilos.enviada : estilos.pendiente}>{estadoEnvio(fila.enviada)}</span></td>
                  <td>{fila.bloquesEnviados} / {fila.minimoBloques}</td>
                </tr>)}</tbody>
              </table>
            </div>}
        </>}
      </>}
    </section>}
  </div>;
}
