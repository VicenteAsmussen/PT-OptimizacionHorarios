import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { PlanificacionSemestre } from '../asignaturas/types';
import { administracionPeriodosApi as servicio } from './administracion-periodos.api';
import { carrerasDisponibles, confirmarReinicio, estadosPeriodo, puedeAdministrarPeriodos, puedeCambiarEstado, puedeReiniciar } from './modelo';
import type { AccionReinicio, EstadoPeriodo, ResumenesPeriodo } from './modelo';
import VistaPeriodo from './VistaPeriodo';
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
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [carreraId, setCarreraId] = useState('');
  const [planificacionId, setPlanificacionId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vigente = true;
    setPlanificaciones(null); setError(''); setCarreraId(''); setPlanificacionId('');
    servicio.planificaciones().then(datos => { if (vigente) setPlanificaciones(datos); })
      .catch(fallo => { if (vigente) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los períodos.'); });
    return () => { vigente = false; };
  }, [intento]);
  const planificacion = planificaciones?.find(fila => fila.id === Number(planificacionId) && fila.carreraId === Number(carreraId));
  return <div className={estilos.pagina}>
    <section className={base.pagina} aria-labelledby="titulo-administracion">
      <h1 id="titulo-administracion">Administración de períodos</h1>
      <p className={estilos.descripcion}>Selecciona una carrera y un período para cambiar su estado o reiniciar datos.</p>
      {!planificaciones && !error && <p role="status">Cargando períodos…</p>}
      {error && <div role="alert" className={base.error}>{error} <button onClick={() => setIntento(valor => valor + 1)}>Reintentar</button></div>}
      {planificaciones?.length === 0 && <p>No hay períodos registrados.</p>}
      {!!planificaciones?.length && <fieldset disabled={ocupado} className={base.campos}>
        <legend className={base.soloLectores}>Carrera y período</legend>
        <div className={base.filtros}>
          <label>Carrera<select value={carreraId} onChange={evento => { setCarreraId(evento.target.value); setPlanificacionId(''); }}>
            <option value="">Selecciona una carrera</option>
            {carrerasDisponibles(planificaciones).map(carrera => <option key={carrera.id} value={carrera.id}>{carrera.nombre}</option>)}
          </select></label>
          <label>Período<select disabled={!carreraId} value={planificacionId} onChange={evento => setPlanificacionId(evento.target.value)}>
            <option value="">Selecciona un período</option>
            {planificaciones.filter(fila => fila.carreraId === Number(carreraId)).map(fila =>
              <option key={fila.id} value={fila.id}>{fila.codigo}{fila.actual ? ' (actual)' : ''}</option>)}
          </select></label>
        </div>
      </fieldset>}
    </section>
    {planificacion && <PanelPeriodo key={planificacion.id} planificacion={planificacion} alOcupar={setOcupado} />}
  </div>;
}

function PanelPeriodo({ planificacion, alOcupar }: { planificacion: PlanificacionSemestre; alOcupar: (valor: boolean) => void }) {
  const [resumenes, setResumenes] = useState<ResumenesPeriodo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [accion, setAccion] = useState<AccionReinicio | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState<EstadoPeriodo>(planificacion.estadoPlanificacion);
  const vigente = useRef(true);
  const enviando = useRef(false);
  const consulta = useRef(0);
  useEffect(() => {
    vigente.current = true;
    void cargar();
    return () => { vigente.current = false; consulta.current++; };
  }, []);
  async function cargar() {
    const revision = ++consulta.current;
    const actual = () => vigente.current && revision === consulta.current;
    setCargando(true); setResumenes(null); setAccion(null); setConfirmacion(''); setError('');
    try {
      const [gestionadas, externas, todas] = await Promise.all([
        servicio.resumen(planificacion.id, 'gestionadas'), servicio.resumen(planificacion.id, 'externas'), servicio.resumen(planificacion.id, 'todas'),
      ]);
      if (actual()) { setResumenes({ gestionadas, externas, todas }); setNuevoEstado(todas.planificacion.estadoPlanificacion); }
    } catch (fallo) {
      if (actual()) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el período.');
    } finally { if (actual()) setCargando(false); }
  }
  async function ejecutar(accion: () => Promise<string>) {
    if (enviando.current) return;
    enviando.current = true; setOcupado(true); alOcupar(true); setMensaje('');
    try {
      const texto = await accion();
      if (vigente.current) setMensaje(texto);
    } catch (fallo) {
      if (vigente.current) setMensaje(`${fallo instanceof Error ? fallo.message : 'No se pudo confirmar la operación.'} Revisa los datos actualizados antes de reintentar.`);
    } finally {
      if (vigente.current) await cargar();
      enviando.current = false;
      if (vigente.current) { setOcupado(false); alOcupar(false); }
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
      return `Estado cambiado a ${estadosPeriodo[nuevoEstado]}.`;
    });
  }
  return <>
    {mensaje && <p role="status" className={base.estado}>{mensaje}</p>}
    {error && <div role="alert" className={base.error}>{error} <button disabled={ocupado || cargando} onClick={() => void cargar()}>Reintentar</button></div>}
    {cargando && <p role="status">Cargando período…</p>}
    {resumenes && <VistaPeriodo resumenes={resumenes} nuevoEstado={nuevoEstado} accion={accion} confirmacion={confirmacion}
      bloqueado={ocupado || cargando} alNuevoEstado={setNuevoEstado} alSeleccionarAccion={opcion => { setAccion(opcion); setConfirmacion(''); }}
      alConfirmacion={setConfirmacion} alReiniciar={reiniciar} alCancelar={() => { setAccion(null); setConfirmacion(''); }} alCambiarEstado={cambiarEstado} />}
  </>;
}
