import { useEffect, useReducer, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';
import { miHorarioApi } from './mi-horario.api';
import { estadoInicial, planificacionesVisibles, puedeConsultarMiHorario, reducirHorario } from './modelo';
import type { ContextoHorario } from './types';
import CalendarioSemanal from './CalendarioSemanal';
import EncabezadoMiHorario from './EncabezadoMiHorario';
import estilos from './MiHorario.module.css';

export function RequireMiHorario() {
  const { usuario } = useAuth();
  return puedeConsultarMiHorario(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}

export default function MiHorarioPage() {
  const { usuario } = useAuth();
  return <ConsultaMiHorario key={usuario?.id} />;
}

function mensajeError(fallo: unknown) {
  return fallo instanceof ApiError ? fallo.message : 'No se pudo cargar tu horario. Inténtalo nuevamente.';
}

function ConsultaMiHorario() {
  const [contexto, setContexto] = useState<ContextoHorario | null>(null);
  const [errorContexto, setErrorContexto] = useState('');
  const [intento, setIntento] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const [estado, dispatch] = useReducer(reducirHorario, estadoInicial);

  useEffect(() => {
    const controlador = new AbortController();
    let activo = true;
    setErrorContexto('');
    setContexto(null);
    miHorarioApi.contexto(controlador.signal).then(datos => {
      if (!activo) return;
      const planificaciones = planificacionesVisibles(datos.planificaciones);
      setContexto({ ...datos, planificaciones });
      if (planificaciones.length > 0) dispatch({ tipo: 'seleccionar', id: planificaciones[0].id });
    }).catch(fallo => { if (activo) setErrorContexto(mensajeError(fallo)); });
    return () => { activo = false; controlador.abort(); };
  }, [intento]);

  useEffect(() => {
    if (estado.id === null) return;
    const id = estado.id;
    const controlador = new AbortController();
    let activo = true;
    miHorarioApi.consultar(id, controlador.signal).then(horarios => {
      if (activo) dispatch({ tipo: 'cargado', id, horarios });
    }).catch(fallo => { if (activo) dispatch({ tipo: 'fallo', id, mensaje: mensajeError(fallo) }); });
    return () => { activo = false; controlador.abort(); };
  }, [estado.id, recarga]);

  return <section className={estilos.pagina} aria-labelledby="titulo-mi-horario">
    <EncabezadoMiHorario planificaciones={contexto?.planificaciones ?? []} planificacionId={estado.id}
      seleccionar={id => dispatch({ tipo: 'seleccionar', id })} />
    {errorContexto ? <div className={estilos.tarjeta}><p role="alert">{errorContexto}</p>
      <button type="button" className="boton boton--azul" onClick={() => setIntento(i => i + 1)}>Reintentar</button></div>
      : contexto === null ? <p role="status">Cargando planificaciones.</p>
      : contexto.planificaciones.length === 0 ? <p className={estilos.tarjeta} role="status">No tienes horarios disponibles en planificaciones en Propuesta o Publicado.</p>
      : <div className={estilos.tarjeta} aria-live="polite">
          {estado.modo === 'cargando' ? <p role="status">Cargando horario.</p>
            : estado.modo === 'error' ? <><p role="alert">{estado.error}</p>
              <button type="button" className="boton boton--azul" onClick={() => {
                if (estado.id !== null) dispatch({ tipo: 'seleccionar', id: estado.id });
                setRecarga(i => i + 1);
              }}>Reintentar</button></>
            : estado.horarios.length === 0 ? <p role="status">No tienes clases con horario asignado en esta planificación.</p>
            : estado.id !== null && <CalendarioSemanal bloques={contexto.bloques} horarios={estado.horarios} planificacionId={estado.id} />}
        </div>}
  </section>;
}
