import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { notificaciones } from '../../lib/notificaciones';
import { resultadosHorariosApi } from '../resultados-horarios/resultados-horarios.api';
import type { PlanificacionSemestre } from '../asignaturas/types';
import { crearSeguimiento } from './seguimiento';
import type { EstadoSeguimiento } from './seguimiento';
import { optimizacionApi } from './optimizacion.api';
import { destinoAlTerminar, etiquetasEstado, puedeOptimizar, rutaModelo, rutaResultados } from './modelo';
import type { Ejecucion } from './types';
import IconoModelo from './IconoModelo';

const Contexto = createContext<{
  seguimiento: ReturnType<typeof crearSeguimiento>; planificaciones: PlanificacionSemestre[] | null; error: string; reintentar: () => void;
} | null>(null);
const vacio: Record<number, EstadoSeguimiento> = {};

export function SeguimientoOptimizacion({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  return <SeguimientoCuenta key={usuario?.id ?? 'sin-cuenta'}>{children}</SeguimientoCuenta>;
}
function SeguimientoCuenta({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const habilitado = puedeOptimizar(usuario?.rol);
  const [planificaciones, setPlanificaciones] = useState<PlanificacionSemestre[] | null>(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [aviso, setAviso] = useState<Ejecucion | null>(null);
  const seguimiento = useMemo(() => crearSeguimiento(optimizacionApi, {
    getItem: clave => sessionStorage.getItem(clave),
    setItem: (clave, valor) => sessionStorage.setItem(clave, valor),
    removeItem: clave => sessionStorage.removeItem(clave),
  }, String(usuario?.id)), [usuario?.id]);
  const filas = useSyncExternalStore(seguimiento.suscribir, seguimiento.estado);
  const ubicacion = useLocation();
  const ubicacionActual = useRef(ubicacion);
  ubicacionActual.current = ubicacion;
  const navegar = useNavigate();
  useEffect(() => seguimiento.alTerminar(ejecucion => {
    const actual = ubicacionActual.current;
    if (destinoAlTerminar(ejecucion, actual.pathname, actual.search) === 'redirigir') {
      notificaciones.exito('La solución se incorporó como Propuesta. No está publicada.');
      navegar(rutaResultados(ejecucion.planificacionSemestreId));
    } else {
      setAviso(ejecucion);
      const texto = `Modelo: ${etiquetasEstado[ejecucion.estado]}.`;
      if (ejecucion.estado === 'aplicada') notificaciones.exito(texto);
      else notificaciones.advertencia(texto);
    }
  }), [seguimiento, navegar]);
  useEffect(() => {
    if (!habilitado) return;
    let activo = true;
    const controlador = new AbortController();
    setError('');
    resultadosHorariosApi.planificaciones(controlador.signal).then(datos => {
      if (activo) setPlanificaciones(datos);
    }).catch(fallo => { if (activo) setError(fallo instanceof Error ? fallo.message : 'No se pudieron consultar las planificaciones.'); });
    return () => { activo = false; controlador.abort(); };
  }, [habilitado, intento]);
  useEffect(() => {
    if (!habilitado || !planificaciones) return;
    let activo = true;
    let temporizador: ReturnType<typeof setTimeout>;
    async function consultar() {
      await Promise.all(planificaciones!.map(p => seguimiento.actualizar(p.id)));
      if (activo) temporizador = setTimeout(() => { void consultar(); }, 5000);
    }
    void consultar();
    return () => { activo = false; clearTimeout(temporizador); };
  }, [habilitado, planificaciones, seguimiento]);
  const activas = Object.values(filas).filter(f => f.ejecucion?.estado === 'en_ejecucion');
  function contextoPlanificacion(id: number) {
    const planificacion = planificaciones?.find(p => p.id === id);
    return planificacion ? ` · ${planificacion.carrera.nombre} · ${planificacion.codigo}` : '';
  }
  return <Contexto.Provider value={{ seguimiento, planificaciones, error, reintentar: () => setIntento(i => i + 1) }}>
    {habilitado && activas.length > 0 && <aside className="aviso-optimizacion" aria-label="Ejecuciones del modelo">
      <p role="status">El modelo está calculando. Puedes navegar y consultar, los datos utilizados no se pueden editar hasta que termine.</p>
      {activas.map(f => <p key={f.ejecucion!.id}><Link to={rutaModelo(f.ejecucion!.planificacionSemestreId)}>Seguir cálculo{contextoPlanificacion(f.ejecucion!.planificacionSemestreId)}</Link>
        {f.error && <span role="alert"> · Seguimiento sin confirmar: {f.error}</span>}</p>)}
    </aside>}
    {habilitado && aviso && filas[aviso.planificacionSemestreId]?.ejecucion?.id === aviso.id && <aside className="aviso-optimizacion" aria-label="Resultado del modelo">
      <p role="status"><strong>{etiquetasEstado[aviso.estado]}</strong>{contextoPlanificacion(aviso.planificacionSemestreId)}</p>
      <Link className="enlace-modelo" to={aviso.estado === 'aplicada' ? rutaResultados(aviso.planificacionSemestreId) : rutaModelo(aviso.planificacionSemestreId)}>
        {aviso.estado === 'aplicada' && <IconoModelo tipo="ver" />}
        {aviso.estado === 'aplicada' ? 'Ver horario generado' : 'Ver diagnóstico'}</Link>{' '}
      <button type="button" className="boton" onClick={() => setAviso(null)}>Cerrar aviso</button>
    </aside>}
    {children}
  </Contexto.Provider>;
}
export function useOptimizacion() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('Falta el seguimiento de optimización.');
  const filas = useSyncExternalStore(contexto.seguimiento.suscribir, contexto.seguimiento.estado);
  return { ...contexto, filas };
}
export function useBloqueoOptimizacion(id?: number | null, carreraId?: number) {
  const contexto = useContext(Contexto);
  const filas = useSyncExternalStore(contexto?.seguimiento.suscribir ?? (() => () => {}), contexto?.seguimiento.estado ?? (() => vacio));
  return Object.values(filas).some(f => f.ejecucion?.estado === 'en_ejecucion' && (f.ejecucion.planificacionSemestreId === id
    || (carreraId !== undefined && contexto?.planificaciones?.some(p => p.id === f.ejecucion!.planificacionSemestreId && p.carreraId === carreraId))));
}
export function AvisoBloqueo({ bloqueado }: { bloqueado: boolean }) {
  return bloqueado ? <p role="status">Edición bloqueada mientras el modelo calcula esta planificación. La lectura y la navegación siguen disponibles. El backend valida cada operación.</p> : null;
}
