import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { asignaturasApi } from './asignaturas.api';
import { contarSecciones, estadoSecciones, filtrarAsignaturas, limpiarFiltros, puedeGestionarAsignaturas, planificacionInicial } from './datos';
import type { Asignatura, Departamento, PlanificacionSemestre } from './types';
import EditarAsignatura from './EditarAsignatura';
import PanelSecciones from './PanelSecciones';
import estilos from './Asignaturas.module.css';

export function RequireGestionAsignaturas() {
  const { usuario } = useAuth();
  return puedeGestionarAsignaturas(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}
interface Datos { asignaturas: Asignatura[]; departamentos: Departamento[]; planificaciones: PlanificacionSemestre[] }
type Conteos = { usuarioId: number | undefined; planificacionSemestreId: number } & (
  { estado: 'cargando' } | { estado: 'error'; mensaje: string } | { estado: 'listo'; cantidades: Map<string, number> }
);
export default function AsignaturasPage() {
  const { usuario } = useAuth();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [malla, setMalla] = useState('');
  const [planificacionSemestreId, setPlanificacionSemestreId] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<{ tipo: 'editar' | 'secciones'; asignatura: Asignatura } | null>(null);
  const [conteos, setConteos] = useState<Conteos | null>(null);
  const solicitudConteos = useRef(0);
  const solicitud = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const cargar = useCallback(async () => {
    const numero = ++solicitud.current;
    setCargando(true);
    setDatos(null);
    setError('');
    try {
      const [asignaturas, departamentos, planificaciones] = await Promise.all([
        asignaturasApi.listar(), asignaturasApi.departamentos(), asignaturasApi.planificaciones(),
      ]);
      if (numero === solicitud.current) {
        setDatos({ asignaturas, departamentos, planificaciones });
        setPlanificacionSemestreId(anterior => planificaciones.some(p => p.id === anterior) ? anterior : planificacionInicial(planificaciones));
      }
    } catch (fallo) {
      if (numero === solicitud.current) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar las asignaturas.');
    } finally {
      if (numero === solicitud.current) setCargando(false);
    }
  }, []);
  useEffect(() => {
    setSeleccion(null);
    setPlanificacionSemestreId(null);
    void cargar();
    return () => { solicitud.current++; };
  }, [cargar, usuario?.id]);
  const cargarConteos = useCallback(async () => {
    const numero = ++solicitudConteos.current;
    if (planificacionSemestreId === null) {
      setConteos(null);
      return;
    }
    const contexto = { usuarioId: usuario?.id, planificacionSemestreId };
    // Una lectura fallida nunca conserva cantidades de otra carrera o periodo.
    setConteos({ ...contexto, estado: 'cargando' });
    try {
      const ofertas = await asignaturasApi.ofertasPlanificacion(planificacionSemestreId);
      if (numero === solicitudConteos.current) {
        setConteos({ ...contexto, estado: 'listo', cantidades: contarSecciones(ofertas, planificacionSemestreId) });
      }
    } catch (fallo) {
      if (numero === solicitudConteos.current) setConteos({ ...contexto, estado: 'error',
        mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar los conteos.' });
    }
  }, [planificacionSemestreId, usuario?.id]);
  useEffect(() => {
    void cargarConteos();
    return () => { solicitudConteos.current++; };
  }, [cargarConteos]);
  const conteoVigente = conteos?.usuarioId === usuario?.id && conteos?.planificacionSemestreId === planificacionSemestreId ? conteos : null;
  function restablecerFiltros() {
    const filtros = limpiarFiltros({ busqueda, departamento, malla });
    setBusqueda(filtros.busqueda);
    setDepartamento(filtros.departamento);
    setMalla(filtros.malla);
  }
  const visibles = datos ? filtrarAsignaturas(datos.asignaturas, busqueda, departamento, malla) : [];
  const planificacion = datos?.planificaciones.find(p => p.id === planificacionSemestreId);
  return <section className={estilos.pagina} aria-labelledby="titulo-asignaturas">
    <header className={estilos.cabecera}><div>
      <h1 id="titulo-asignaturas" tabIndex={-1} ref={titulo}>Asignaturas</h1>
      <p>Edita las asignaturas de tu alcance y gestiona sus secciones por semestre y carrera.</p>
    </div></header>
    <div className={estilos.filtros}>
      <label>Buscar por nombre o código<input type="search" placeholder="Buscar por nombre o código" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
      <label>Departamento<select value={departamento} onChange={e => setDepartamento(e.target.value)}>
        <option value="">Todos los departamentos</option>
        {datos?.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
      </select></label>
      <label>Semestre de malla<select value={malla} onChange={e => setMalla(e.target.value)}>
        <option value="">Todos</option>{Array.from({ length: 14 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select></label>
      <label>Semestre para secciones<select disabled={cargando} value={planificacionSemestreId ?? ''} onChange={e => {
        setSeleccion(null);
        setPlanificacionSemestreId(e.target.value ? Number(e.target.value) : null);
      }}>
        <option value="">Selecciona carrera y semestre</option>
        {datos?.planificaciones.map(p => <option key={p.id} value={p.id}>{p.carrera.nombre} · {p.codigo}{p.actual ? ' (actual)' : ''}</option>)}
      </select></label>
      <div className={estilos.acciones}><button type="button" className="boton boton--gris" onClick={restablecerFiltros}>Limpiar filtros</button></div>
    </div>
    {cargando && <p role="status" className={estilos.estado}>Cargando asignaturas y planificaciones…</p>}
    {error && <div role="alert" className={estilos.error}><p>{error}</p>
      {guardado && <p>Los cambios ya se guardaron. Reintentar solo actualiza la lista.</p>}
      <button className="boton" type="button" onClick={() => void cargar()}>Reintentar carga</button></div>}
    {datos && <>
      {!planificacion && <p className={estilos.estado}>{datos.planificaciones.length
        ? 'Selecciona carrera y semestre para gestionar secciones. No se elige automáticamente si hay varias carreras actuales.'
        : 'No hay planificaciones disponibles. Puedes editar asignaturas, pero no gestionar secciones.'}</p>}
      {planificacion && <>
        <p className={estilos.contexto}>Secciones en <strong>{planificacion.carrera.nombre} · {planificacion.codigo}</strong> · {estadoSecciones(planificacion).etiqueta}. El catálogo de asignaturas se conserva entre semestres.</p>
        {(!conteoVigente || conteoVigente.estado === 'cargando') && <p role="status">Cargando conteos de secciones…</p>}
        {conteoVigente?.estado === 'error' && <div role="alert" className={estilos.error}>
          <p>Conteo no disponible en {planificacion.codigo}: {conteoVigente.mensaje}</p>
          <p>Puedes seguir editando asignaturas y consultando secciones. No se muestran cantidades anteriores.</p>
          <button type="button" className="boton" onClick={() => void cargarConteos()}>Reintentar conteos</button>
        </div>}
      </>}
      <p role="status">{visibles.length} de {datos.asignaturas.length} asignaturas</p>
      {!visibles.length ? <p className={estilos.estado}>{datos.asignaturas.length
        ? 'No hay asignaturas que coincidan con los filtros.' : 'No hay asignaturas disponibles para tu carrera.'}</p>
        : <div className={estilos.tablaContenedor} tabIndex={0} role="region" aria-label="Tabla de asignaturas">
          <table className={estilos.tabla}><thead><tr><th scope="col">Código</th><th scope="col">Asignatura</th>
            <th scope="col">Departamento</th><th scope="col">Semestre de malla</th><th scope="col">Secciones{planificacion ? ` · ${planificacion.codigo}` : ''}</th><th scope="col">Acciones</th></tr></thead>
            <tbody>{visibles.map(a => <tr key={a.codigo}><th scope="row">{a.codigo}</th><td>{a.nombre}</td>
              <td>{a.departamento.nombre}</td><td>{a.semestreMalla}</td><td>
                {!planificacion ? 'Sin semestre' : conteoVigente?.estado === 'listo'
                  ? (conteoVigente.cantidades.get(a.codigo) ?? 0) === 0
                    ? <span className={estilos.sinSecciones}>Sin secciones</span>
                    : `${conteoVigente.cantidades.get(a.codigo)} secciones`
                  : conteoVigente?.estado === 'error' ? 'Conteo no disponible' : 'Cargando conteos…'}
              </td>
              <td><div className={estilos.acciones}>
                <button className="boton boton--azul" type="button" aria-label={`Editar ${a.nombre}`} onClick={() => setSeleccion({ tipo: 'editar', asignatura: a })}>Editar</button>
                <button className="boton boton--gris" type="button" disabled={!planificacion} aria-label={`Gestionar secciones de ${a.nombre}`}
                  onClick={() => setSeleccion({ tipo: 'secciones', asignatura: a })}>Gestionar secciones</button>
              </div></td></tr>)}</tbody>
          </table>
        </div>}
      {seleccion?.tipo === 'editar' && <EditarAsignatura key={seleccion.asignatura.codigo} asignatura={seleccion.asignatura}
        departamentos={datos.departamentos} alCerrar={() => setSeleccion(null)} alCompletar={() => {
          setSeleccion(null);
          setGuardado(true);
          void cargar();
          titulo.current?.focus();
        }} />}
      {seleccion?.tipo === 'secciones' && planificacion && <PanelSecciones key={`${seleccion.asignatura.codigo}-${planificacion.id}`}
        asignatura={seleccion.asignatura} semestre={planificacion} alCerrar={() => setSeleccion(null)}
        alCambiarOfertas={() => void cargarConteos()} />}
    </>}
  </section>;
}
