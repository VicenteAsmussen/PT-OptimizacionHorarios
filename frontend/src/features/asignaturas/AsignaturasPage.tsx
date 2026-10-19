import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { asignaturasApi } from './asignaturas.api';
import { contarSecciones, filtrarAsignaturas, limpiarFiltros, puedeGestionarAsignaturas, semestreInicial } from './datos';
import type { Asignatura, Departamento, Semestre } from './types';
import EditarAsignatura from './EditarAsignatura';
import PanelSecciones from './PanelSecciones';
import estilos from './Asignaturas.module.css';

export function RequireGestionAsignaturas() {
  const { usuario } = useAuth();
  return puedeGestionarAsignaturas(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}
interface Datos { asignaturas: Asignatura[]; departamentos: Departamento[]; semestres: Semestre[] }
type Conteos = { usuarioId: number | undefined; semestreId: number } & (
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
  const [semestreId, setSemestreId] = useState<number | null>(null);
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
      const [asignaturas, departamentos, semestres] = await Promise.all([
        asignaturasApi.listar(), asignaturasApi.departamentos(), asignaturasApi.semestres(),
      ]);
      if (numero === solicitud.current) {
        setDatos({ asignaturas, departamentos, semestres });
        setSemestreId(anterior => semestres.some(s => s.id === anterior) ? anterior : semestreInicial(semestres));
      }
    } catch (fallo) {
      if (numero === solicitud.current) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar las asignaturas.');
    } finally {
      if (numero === solicitud.current) setCargando(false);
    }
  }, []);
  useEffect(() => {
    setSeleccion(null);
    setSemestreId(null);
    void cargar();
    return () => { solicitud.current++; };
  }, [cargar, usuario?.id]);
  const cargarConteos = useCallback(async () => {
    const numero = ++solicitudConteos.current;
    if (semestreId === null) {
      setConteos(null);
      return;
    }
    const contexto = { usuarioId: usuario?.id, semestreId };
    // Invalidar antes de leer: una lectura fallida nunca conserva cantidades anteriores.
    setConteos({ ...contexto, estado: 'cargando' });
    try {
      const ofertas = await asignaturasApi.ofertasSemestre(semestreId);
      if (numero === solicitudConteos.current) {
        setConteos({ ...contexto, estado: 'listo', cantidades: contarSecciones(ofertas, semestreId) });
      }
    } catch (fallo) {
      if (numero === solicitudConteos.current) setConteos({ ...contexto, estado: 'error',
        mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar los conteos.' });
    }
  }, [semestreId, usuario?.id]);
  useEffect(() => {
    void cargarConteos();
    return () => { solicitudConteos.current++; };
  }, [cargarConteos]);
  // El contexto evita mostrar un conteo anterior incluso antes de ejecutar el efecto.
  const conteoVigente = conteos?.usuarioId === usuario?.id && conteos?.semestreId === semestreId ? conteos : null;
  function restablecerFiltros() {
    const filtros = limpiarFiltros({ busqueda, departamento, malla });
    setBusqueda(filtros.busqueda);
    setDepartamento(filtros.departamento);
    setMalla(filtros.malla);
  }
  const visibles = datos ? filtrarAsignaturas(datos.asignaturas, busqueda, departamento, malla) : [];
  const semestre = datos?.semestres.find(s => s.id === semestreId);
  return <section className={estilos.pagina} aria-labelledby="titulo-asignaturas">
    <header className={estilos.cabecera}><div>
      <h1 id="titulo-asignaturas" tabIndex={-1} ref={titulo}>Asignaturas</h1>
      <p>Edita las asignaturas de tu alcance y gestiona sus secciones por semestre.</p>
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
      <label>Semestre para secciones<select disabled={cargando} value={semestreId ?? ''} onChange={e => {
        setSeleccion(null);
        setSemestreId(e.target.value ? Number(e.target.value) : null);
      }}>
        <option value="">Selecciona un semestre</option>
        {datos?.semestres.map(s => <option key={s.id} value={s.id}>{s.codigo}{s.actual ? ' (actual)' : ''}</option>)}
      </select></label>
      <div className={estilos.acciones}><button type="button" className="boton boton--gris" onClick={restablecerFiltros}>Limpiar filtros</button></div>
    </div>
    {cargando && <p role="status" className={estilos.estado}>Cargando asignaturas y semestres…</p>}
    {error && <div role="alert" className={estilos.error}><p>{error}</p>
      {guardado && <p>Los cambios ya se guardaron. Reintentar solo actualiza la lista.</p>}
      <button className="boton" type="button" onClick={() => void cargar()}>Reintentar carga</button></div>}
    {datos && <>
      {!semestre && <p className={estilos.estado}>{datos.semestres.length
        ? 'Selecciona un semestre para gestionar secciones. No se ha elegido uno automáticamente porque no hay semestre actual.'
        : 'No hay semestres disponibles. Puedes editar asignaturas, pero no gestionar secciones.'}</p>}
      {semestre && <>
        <p className={estilos.contexto}>Secciones en <strong>{semestre.codigo}</strong>. El catálogo de asignaturas se conserva entre semestres.</p>
        {(!conteoVigente || conteoVigente.estado === 'cargando') && <p role="status">Cargando conteos de secciones…</p>}
        {conteoVigente?.estado === 'error' && <div role="alert" className={estilos.error}>
          <p>Conteo no disponible en {semestre.codigo}: {conteoVigente.mensaje}</p>
          <p>Puedes seguir editando asignaturas y gestionando secciones. No se muestran cantidades anteriores.</p>
          <button type="button" className="boton" onClick={() => void cargarConteos()}>Reintentar conteos</button>
        </div>}
      </>}
      <p role="status">{visibles.length} de {datos.asignaturas.length} asignaturas</p>
      {!visibles.length ? <p className={estilos.estado}>{datos.asignaturas.length
        ? 'No hay asignaturas que coincidan con los filtros.' : 'No hay asignaturas disponibles para tu carrera.'}</p>
        : <div className={estilos.tablaContenedor} tabIndex={0} role="region" aria-label="Tabla de asignaturas">
          <table className={estilos.tabla}><thead><tr><th scope="col">Código</th><th scope="col">Asignatura</th>
            <th scope="col">Departamento</th><th scope="col">Semestre de malla</th><th scope="col">Secciones{semestre ? ` · ${semestre.codigo}` : ''}</th><th scope="col">Acciones</th></tr></thead>
            <tbody>{visibles.map(a => <tr key={a.codigo}><th scope="row">{a.codigo}</th><td>{a.nombre}</td>
              <td>{a.departamento.nombre}</td><td>{a.semestreMalla}</td><td>
                {!semestre ? 'Sin semestre' : conteoVigente?.estado === 'listo'
                  ? (conteoVigente.cantidades.get(a.codigo) ?? 0) === 0
                    ? <span className={estilos.sinSecciones}>Sin secciones</span>
                    : `${conteoVigente.cantidades.get(a.codigo)} secciones`
                  : conteoVigente?.estado === 'error' ? 'Conteo no disponible' : 'Cargando conteos…'}
              </td>
              <td><div className={estilos.acciones}>
                <button className="boton boton--azul" type="button" aria-label={`Editar ${a.nombre}`} onClick={() => setSeleccion({ tipo: 'editar', asignatura: a })}>Editar</button>
                <button className="boton boton--gris" type="button" disabled={!semestre} aria-label={`Gestionar secciones de ${a.nombre}`}
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
      {seleccion?.tipo === 'secciones' && semestre && <PanelSecciones key={`${seleccion.asignatura.codigo}-${semestre.id}`}
        asignatura={seleccion.asignatura} semestre={semestre} alCerrar={() => setSeleccion(null)}
        alCambiarOfertas={() => void cargarConteos()} />}
    </>}
  </section>;
}
