import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ordenarPeriodosPorFechaAcademica } from '../../lib/periodos';
import { estadosPeriodo } from '../administracion-periodos/modelo';
import { cargarPlanificaciones, cargarResumen } from './datos';
import { accionesPanel } from './modelo';
import type { PlanificacionPanel, ResumenPanel } from './modelo';
import estilos from './PanelPrincipal.module.css';

export default function DashboardPage() {
  const { usuario } = useAuth();
  return <PanelPrincipal key={`${usuario?.id}:${usuario?.rol}`} rol={usuario?.rol ?? ''} />;
}

function PanelPrincipal({ rol }: { rol: string }) {
  const [planificaciones, setPlanificaciones] = useState<PlanificacionPanel[] | null>(null);
  const [planificacionId, setPlanificacionId] = useState<number | null>(null);
  const [resumen, setResumen] = useState<ResumenPanel | null>(null);
  const [error, setError] = useState('');
  const [errorResumen, setErrorResumen] = useState('');
  const [revision, setRevision] = useState(0);
  const planificacion = planificaciones?.find(disponible => disponible.id === planificacionId);

  useEffect(() => {
    let activo = true;
    setPlanificaciones(null); setResumen(null); setError(''); setErrorResumen('');
    cargarPlanificaciones(rol).then(datos => {
      if (!activo) return;
      setPlanificaciones(datos.planificaciones);
      setPlanificacionId(anterior => datos.planificaciones.some(disponible => disponible.id === anterior) ? anterior : datos.inicial);
    }).catch(() => { if (activo) setError('No se pudo cargar el contexto académico. Intenta actualizar el panel.'); });
    return () => { activo = false; };
  }, [rol, revision]);

  useEffect(() => {
    let activo = true;
    setResumen(null); setErrorResumen('');
    if (planificacion) cargarResumen(rol, planificacion).then(datos => {
      if (activo) setResumen(datos);
    }).catch(fallo => {
      if (activo) setErrorResumen(fallo instanceof Error ? fallo.message : 'No se pudo consultar el resumen. Actualiza el panel.');
    });
    return () => { activo = false; };
  }, [rol, planificacion]);

  return <VistaPanel rol={rol} planificaciones={planificaciones} planificacionId={planificacionId}
    resumen={resumen} error={error} errorResumen={errorResumen}
    seleccionar={id => { setResumen(null); setErrorResumen(''); setPlanificacionId(id); }}
    actualizar={() => setRevision(valor => valor + 1)} />;
}

interface PropiedadesPanel {
  rol: string;
  planificaciones: PlanificacionPanel[] | null;
  planificacionId: number | null;
  resumen: ResumenPanel | null;
  error: string;
  errorResumen: string;
  seleccionar: (id: number | null) => void;
  actualizar: () => void;
}

export function VistaPanel({ rol, planificaciones, planificacionId, resumen, error, errorResumen, seleccionar, actualizar }: PropiedadesPanel) {
  const planificacion = planificaciones?.find(disponible => disponible.id === planificacionId);
  const acciones = accionesPanel(rol, planificacion);
  const consultarResumen = planificacion?.actual && (rol === 'profesor'
    || (rol === 'secretaria' && planificacion.estadoPlanificacion === 'preparacion'));
  return <section className={estilos.pagina} aria-labelledby="titulo-panel">
    <header className={estilos.encabezado}>
      <div><h1 id="titulo-panel">Panel principal</h1><p>Consulta el contexto y accede a la planificación académica.</p></div>
      <button type="button" className={`boton boton--gris ${estilos.actualizar}`} onClick={actualizar}>Actualizar panel</button>
    </header>
    {error ? <p className={estilos.error} role="alert">{error}</p>
      : planificaciones === null ? <p className={estilos.estado} role="status">Cargando contexto académico…</p>
        : planificaciones.length === 0 ? <p className={estilos.estado} role="status">No hay períodos disponibles para tu perfil.</p>
          : <section className={estilos.contexto} aria-labelledby="titulo-contexto-panel">
            <div><h2 id="titulo-contexto-panel">Contexto académico</h2>
              <p id="ayuda-contexto-panel">{rol === 'secretaria' ? 'Planificaciones actuales de tu carrera.' : 'Períodos disponibles según tus permisos y asignaciones.'}</p>
            </div>
            {(planificaciones.length > 1 || !planificacion) && <label htmlFor="planificacion-panel">Carrera y período
              <select id="planificacion-panel" aria-describedby="ayuda-contexto-panel" value={planificacionId ?? ''}
                onChange={evento => seleccionar(evento.target.value ? Number(evento.target.value) : null)}>
                <option value="">Selecciona una carrera y un período</option>
                {ordenarPeriodosPorFechaAcademica(planificaciones).map(disponible => <option key={disponible.id} value={disponible.id}>
                  {disponible.codigo} — {disponible.carreraNombre}{disponible.actual ? '' : ' (Histórico)'}
                </option>)}
              </select>
            </label>}
            {planificacion ? <dl className={estilos.datosContexto}>
              <div><dt>Carrera</dt><dd>{planificacion.carreraNombre}</dd></div>
              <div><dt>Período</dt><dd>{planificacion.codigo} · {planificacion.actual ? 'Actual' : 'Histórico'}</dd></div>
              <div><dt>Estado de planificación</dt><dd>{estadosPeriodo[planificacion.estadoPlanificacion] ?? 'Estado no disponible'}</dd></div>
            </dl> : <p className={estilos.seleccionPendiente} role="status">Selecciona una carrera y un período para consultar su contexto.</p>}
          </section>}
    {['admin', 'secretaria', 'profesor'].includes(rol) && <div className={estilos.contenido}>
      <section className={estilos.tarea} aria-labelledby="titulo-tarea-panel">
        <h2 id="titulo-tarea-panel">{acciones.titulo}</h2>
        <p>{acciones.descripcion}</p>
        {consultarResumen && <div aria-live="polite">
          {errorResumen ? <p className={estilos.error} role="alert">{errorResumen}</p>
            : resumen ? <><p className={estilos.resumen}>{resumen.mensaje}</p><p className={estilos.nota}>{resumen.nota}</p></>
              : <p className={estilos.estado} role="status">Cargando disponibilidad…</p>}
        </div>}
        <Link className={`boton ${estilos.principal}`} to={acciones.principal.ruta}>{acciones.principal.nombre}</Link>
      </section>
      <section className={estilos.otros} aria-labelledby="titulo-accesos-panel">
        <h2 id="titulo-accesos-panel">Otros accesos</h2>
        <ul>{acciones.secundarios.map(accion => <li key={accion.ruta}><Link to={accion.ruta}>{accion.nombre}</Link></li>)}</ul>
      </section>
    </div>}
    <p className={estilos.nota}>Los destinos mantienen sus propios selectores. Revisa la carrera y el período al abrir cada página.</p>
  </section>;
}
