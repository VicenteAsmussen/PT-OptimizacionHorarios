import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../lib/api";
import { notificaciones } from "../../lib/notificaciones";
import { crearNotificacionesProfesores } from "./notificaciones";
import { filtrarProfesores } from "./datos";
import { derivarAlcanceProfesores, puedeAdministrarProfesor, puedeGestionarProfesores } from "./permisos";
import { profesoresApi } from "./profesores.api";
import type { AlcanceProfesores, DepartamentoProfesor, FiltrosProfesores, Profesor } from "./types";
import FormularioProfesor from "./FormularioProfesor";
import AccionesProfesor, { type AccionProfesor } from "./AccionesProfesor";
import TablaProfesores from "./TablaProfesores";
import IconoProfesor from "./IconoProfesor";
import estilos from "./Profesores.module.css";

export function RequireGestionProfesores() {
  const { usuario } = useAuth();
  return puedeGestionarProfesores(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}

type Seleccion = { accion: AccionProfesor; profesor: Profesor } | { accion: "crear" };
interface Datos {
  profesores: Profesor[];
  departamentos: DepartamentoProfesor[];
  alcance: AlcanceProfesores;
}

export default function ProfesoresPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardadoSinActualizar, setGuardadoSinActualizar] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosProfesores>({});
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const solicitud = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const avisos = useRef(crearNotificacionesProfesores(notificaciones));
  // El diálogo conserva esta versión: una carga nueva o desmontaje invalida su respuesta.
  const versionDialogo = solicitud.current;

  const cargar = useCallback(async () => {
    const numero = ++solicitud.current;
    setCargando(true);
    setError("");
    // No conservar una tabla obsoleta utilizable después de una mutación.
    setDatos(null);
    try {
      const [profesores, departamentos, carreras] = await Promise.all([
        profesoresApi.listar(), profesoresApi.listarDepartamentos(), profesoresApi.listarCarreras(),
      ]);
      if (numero === solicitud.current) {
        setDatos({ profesores, departamentos, alcance: derivarAlcanceProfesores(carreras) });
        setGuardadoSinActualizar(false);
      }
      avisos.current.resultado(true, () => numero === solicitud.current);
    } catch (fallo) {
      avisos.current.resultado(false, () => numero === solicitud.current);
      if (numero === solicitud.current) setError(fallo instanceof ApiError ? fallo.message
        : "No se pudieron cargar los profesores. Revisa tu conexión e inténtalo nuevamente.");
    } finally {
      if (numero === solicitud.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    setSeleccion(null);
    setGuardadoSinActualizar(false);
    void cargar();
    return () => {
      solicitud.current++;
      avisos.current.limpiar();
    };
  }, [cargar, usuario?.id]);

  function completar() {
    if (versionDialogo !== solicitud.current) return;
    setSeleccion(null);
    setGuardadoSinActualizar(true);
    avisos.current.guardado(() => versionDialogo === solicitud.current);
    void cargar();
    // El disparador puede desaparecer (eliminación/filtros); ofrecer un destino estable.
    titulo.current?.focus();
  }

  const visibles = datos ? filtrarProfesores(datos.profesores, filtros) : [];
  const puedeCrear = datos?.departamentos.some((departamento) => puedeAdministrarProfesor(rol,
    { departamentoId: departamento.id, tipo: "part time" }, datos.alcance));

  return <section className={estilos.pagina} aria-labelledby="titulo-profesores">
    <header className={estilos.cabecera}>
      <div><h1 id="titulo-profesores" ref={titulo} tabIndex={-1}>Profesores</h1>
        <p>Administra los datos académicos de los profesores y sus accesos al sistema.</p></div>
      <button type="button" className={`boton boton--crear ${estilos.botonConIcono}`} disabled={cargando || !puedeCrear}
        onClick={() => setSeleccion({ accion: "crear" })}><IconoProfesor tipo="agregar" />Agregar profesor</button>
    </header>
    <div className={estilos.filtros}>
      <label>Buscar por nombre o RUT<input type="search" value={filtros.busqueda ?? ""} placeholder="Buscar por nombre o RUT"
        onChange={(evento) => setFiltros({ ...filtros, busqueda: evento.target.value })} /></label>
      <label>Departamento<select value={filtros.departamentoId ?? ""} onChange={(evento) => setFiltros({ ...filtros,
        departamentoId: evento.target.value ? Number(evento.target.value) : undefined })}>
        <option value="">Todos los departamentos</option>
        {datos?.departamentos.map((departamento) => <option key={departamento.id} value={departamento.id}>{departamento.nombre}</option>)}
      </select></label>
      <label>Tipo<select value={filtros.tipo ?? ""} onChange={(evento) => setFiltros({ ...filtros,
        tipo: evento.target.value as FiltrosProfesores["tipo"] || undefined })}>
        <option value="">Todos los tipos</option><option value="planta">Planta</option><option value="part time">Part time</option>
      </select></label>
      <label>Acceso al sistema<select value={filtros.acceso ?? ""} onChange={(evento) => setFiltros({ ...filtros,
        acceso: evento.target.value as FiltrosProfesores["acceso"] || undefined })}>
        <option value="">Todos los accesos</option><option value="con acceso">Con acceso</option><option value="sin acceso">Sin acceso</option>
      </select></label>
    </div>
    {cargando && <p role="status" className={estilos.estado}>Cargando profesores y permisos…</p>}
    {error && <div role="alert" className={estilos.error}><p>{error}</p>
      {guardadoSinActualizar && <p>Los cambios ya se guardaron. Reintentar solo vuelve a consultar la lista.</p>}
      <button type="button" className="boton" onClick={() => void cargar()}>Reintentar carga</button></div>}
    {datos && <>
      <p role="status">{visibles.length} de {datos.profesores.length} profesores</p>
      {!visibles.length ? <p className={estilos.estado}>{datos.profesores.length
        ? "No hay profesores que coincidan con los filtros." : "No hay profesores disponibles."}</p>
        : <TablaProfesores profesores={visibles} rol={rol} alcance={datos.alcance}
          alAccionar={(accion, profesor) => setSeleccion({ accion, profesor })} />}
      {seleccion && (seleccion.accion === "crear" || seleccion.accion === "editar"
        ? <FormularioProfesor profesor={seleccion.accion === "editar" ? seleccion.profesor : undefined}
          departamentos={datos.departamentos} rol={rol} alcance={datos.alcance}
          alCerrar={() => setSeleccion(null)} alCompletar={completar} />
        : <AccionesProfesor accion={seleccion.accion} profesor={seleccion.profesor} rol={rol} alcance={datos.alcance}
          alCerrar={() => setSeleccion(null)} alCompletar={completar} />)}
    </>}
  </section>;
}
