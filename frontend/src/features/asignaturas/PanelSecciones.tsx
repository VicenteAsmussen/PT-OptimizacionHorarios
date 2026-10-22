import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { asignaturasApi } from './asignaturas.api';
import { estadoSecciones, ofertasDePlanificacion, prepararOferta, seccionesLibres, tiposPendientes } from './datos';
import type { Asignatura, Oferta, ProfesorSeccion, PlanificacionSemestre } from './types';
import { useMutacion } from './useMutacion';
import PanelAsignatura from './PanelAsignatura';
import SelectorProfesor from './SelectorProfesor';
import estilos from './Asignaturas.module.css';

type Accion = { tipo: 'editar'; oferta: Oferta } | { tipo: 'crear' } | { tipo: 'eliminar'; oferta: Oferta };
type Propiedades = {
  asignatura: Asignatura; semestre: PlanificacionSemestre; alCerrar: () => void; alCambiarOfertas: () => void;
};
type Asignaciones = { tipoHoraId: number; profesorId: number | null }[];

export function EditorAsignaciones({ asignatura, profesores, asignaciones, alCambiar }: {
  asignatura: Asignatura; profesores: ProfesorSeccion[]; asignaciones: Asignaciones; alCambiar: (valor: Asignaciones) => void;
}) {
  const tipos = (asignatura.tiposHora ?? []).filter(t => t.horas > 0 || asignaciones.some(a => a.tipoHoraId === t.tipoHoraId));
  function seleccionar(tipoHoraId: number, profesorId: number | null) {
    let nuevas = [...asignaciones.filter(a => a.tipoHoraId !== tipoHoraId), { tipoHoraId, profesorId }];
    if (profesorId !== null && tipoHoraId === tipos[0]?.tipoHoraId) {
      for (const tipo of tipos.slice(1)) if (nuevas.find(a => a.tipoHoraId === tipo.tipoHoraId)?.profesorId == null) {
        nuevas = [...nuevas.filter(a => a.tipoHoraId !== tipo.tipoHoraId), { tipoHoraId: tipo.tipoHoraId, profesorId }];
      }
    }
    alCambiar(nuevas);
  }
  return <>
    <div className={estilos.tablaContenedor}>
      <table className={estilos.tablaAsignaciones}>
        <caption>Profesores por tipo de hora</caption>
        <thead><tr><th scope="col">Tipo de hora</th><th scope="col">Horas</th><th scope="col">Profesor</th></tr></thead>
        <tbody>{tipos.map(tipo => <tr key={tipo.tipoHoraId}>
          <th scope="row">{tipo.tipoHora.tipo}</th><td>{tipo.horas}</td>
          <td><SelectorProfesor profesores={profesores} contexto={tipo.tipoHora.tipo}
            profesorId={asignaciones.find(a => a.tipoHoraId === tipo.tipoHoraId)?.profesorId ?? null}
             alSeleccionar={profesorId => seleccionar(tipo.tipoHoraId, profesorId)} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!tipos.length && <p>No hay tipos de hora con carga para asignar profesores.</p>}
    {tipos.length > 1 && <p>Al elegir al profesor del primer tipo se completan los demás tipos sin asignar. Puedes cambiarlos antes de guardar.</p>}
  </>;
}
export default function PanelSecciones(propiedades: Propiedades) {
  const { asignatura, semestre } = propiedades;
  // Cambiar de contexto desmonta formularios y silencia las mutaciones tardías.
  return <ContenidoSecciones key={`${asignatura.codigo}-${semestre.id}-${semestre.actual}-${semestre.estadoPlanificacion}`}
    {...propiedades} />;
}
function ContenidoSecciones({ asignatura, semestre, alCerrar, alCambiarOfertas }: Propiedades) {
  const { etiqueta, puedeEditar, motivo } = estadoSecciones(semestre);
  const vigente = useRef(false);
  useEffect(() => {
    vigente.current = true;
    return () => { vigente.current = false; };
  }, []);
  const [datos, setDatos] = useState<{ ofertas: Oferta[]; profesores: ProfesorSeccion[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [seccion, setSeccion] = useState('');
  const [cupos, setCupos] = useState('0');
  const [asignaciones, setAsignaciones] = useState<Asignaciones>([]);
  const solicitud = useRef(0);
  const contenido = useRef<HTMLHeadingElement>(null);
  const { ocupado, error, ejecutar } = useMutacion();
  const cargar = useCallback(async () => {
    const numero = ++solicitud.current;
    setCargando(true);
    setDatos(null);
    setErrorCarga('');
    try {
      const [ofertas, profesores] = await Promise.all([
        asignaturasApi.ofertas(asignatura.codigo, semestre.id), asignaturasApi.profesores(),
      ]);
      if (numero === solicitud.current) setDatos({
        ofertas: ofertasDePlanificacion(ofertas, asignatura.codigo, semestre.id), profesores,
      });
    } catch (fallo) {
      if (numero === solicitud.current) setErrorCarga(fallo instanceof Error ? fallo.message : 'No se pudieron cargar las secciones.');
    } finally {
      if (numero === solicitud.current) setCargando(false);
    }
  }, [asignatura.codigo, semestre.id]);
  useEffect(() => {
    void cargar();
    return () => { solicitud.current++; };
  }, [cargar]);
  useEffect(() => {
    // Cada cambio de vista conserva un destino de foco dentro del único panel.
    contenido.current?.focus();
  }, [accion]);
  const libres = seccionesLibres(datos?.ofertas ?? [], accion?.tipo === 'editar' ? accion.oferta.id : undefined);
  function abrir(nueva: Accion) {
    if (!vigente.current || !puedeEditar || ocupado) return;
    if (nueva.tipo === 'eliminar' && nueva.oferta.horarios?.length) return;
    setAccion(nueva);
    setSeccion(String(nueva.tipo === 'crear' ? libres[0] : nueva.oferta.seccion));
    setCupos(String(nueva.tipo === 'crear' ? 0 : nueva.oferta.cupos));
    setAsignaciones(nueva.tipo === 'crear' ? [] : nueva.oferta.asignaciones.map(({ tipoHoraId, profesorId }) => ({ tipoHoraId, profesorId })));
  }
  function completar() {
    if (!vigente.current) return;
    alCambiarOfertas();
    setGuardado(true);
    setAccion(null);
    void cargar();
    contenido.current?.focus();
  }
  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!vigente.current || !puedeEditar || ocupado || !accion || !datos) return;
    if (accion.tipo === 'eliminar' && accion.oferta.horarios?.length) return;
    void ejecutar(async () => {
      if (accion.tipo === 'eliminar') {
        await asignaturasApi.eliminarOferta(accion.oferta.id);
      } else {
        const payload = prepararOferta({ seccion, cupos, asignaciones }, datos.profesores, libres);
        if (accion.tipo === 'crear') await asignaturasApi.crearOferta(asignatura.codigo, semestre.id, payload);
        else await asignaturasApi.editarOferta(accion.oferta.id, payload);
      }
    }, completar);
  }
  return <PanelAsignatura titulo={`Secciones · ${asignatura.codigo}`} ocupado={ocupado} alCerrar={alCerrar}>
    <p>{asignatura.nombre}</p>
    <p className={estilos.estado}>Semestre seleccionado: <strong>{semestre.carrera.nombre} · {semestre.codigo}</strong>{semestre.actual ? ' (actual)' : ''} · {etiqueta}.
      Para cambiarlo, cierra este panel y utiliza el selector de semestre.</p>
    {motivo && <p id="motivo-secciones" role="status" className={estilos.estado}>{motivo}</p>}
    <h3 ref={contenido} tabIndex={-1}>{accion?.tipo === 'crear' ? 'Agregar sección'
      : accion?.tipo === 'editar' ? `Editar sección ${accion.oferta.seccion}`
      : accion?.tipo === 'eliminar' ? `Eliminar sección ${accion.oferta.seccion}` : 'Secciones del semestre'}</h3>
    {cargando && <p role="status">Cargando secciones y profesores…</p>}
    {errorCarga && <div role="alert" className={estilos.error}><p>{errorCarga}</p>
      {guardado && <p>Los cambios ya se guardaron. Reintentar solo actualiza la lista.</p>}
      <button type="button" className="boton" onClick={() => void cargar()}>Reintentar carga</button></div>}
    {datos && !accion && <>
      <p role="status">{datos.ofertas.length} de 5 secciones en {semestre.codigo}</p>
      {puedeEditar && !libres.length && <p className={estilos.estado}>Máximo de 5 secciones alcanzado. Elimina una sección sin horarios para liberar su número.</p>}
      <button type="button" className="boton boton--crear" disabled={!puedeEditar || !libres.length} aria-describedby={motivo ? 'motivo-secciones' : undefined} onClick={() => abrir({ tipo: 'crear' })}>Agregar sección</button>
      {!datos.ofertas.length && <p>No hay secciones para esta asignatura en el semestre seleccionado.</p>}
      <ul className={estilos.secciones}>{datos.ofertas.map(o => <li key={o.id}>
        <h4>Sección {o.seccion}</h4><p>{o.cupos} cupos</p>
        <ul>{o.asignaciones.map(a => <li key={a.tipoHoraId}>{a.tipoHora.tipo}: {a.profesor.nombre}</li>)}</ul>
        {tiposPendientes(asignatura, o).length > 0 && <p role="status">Falta asignar profesor: {tiposPendientes(asignatura, o).map(t => t.tipoHora.tipo).join(', ')}.</p>}
        <div className={estilos.acciones}>
          <button type="button" className="boton boton--azul" disabled={!puedeEditar} aria-describedby={motivo ? 'motivo-secciones' : undefined} onClick={() => abrir({ tipo: 'editar', oferta: o })}>Editar sección {o.seccion}</button>
          <button type="button" className="boton boton--eliminar" disabled={!puedeEditar || Boolean(o.horarios?.length)}
            aria-describedby={[motivo ? 'motivo-secciones' : '', o.horarios?.length ? `motivo-horarios-${o.id}` : ''].filter(Boolean).join(' ') || undefined}
            onClick={() => abrir({ tipo: 'eliminar', oferta: o })}>Eliminar sección {o.seccion}</button>
        </div>
        {Boolean(o.horarios?.length) && <p id={`motivo-horarios-${o.id}`}>No se puede eliminar: tiene horarios asociados.</p>}
      </li>)}</ul>
    </>}
    {datos && accion && <form onSubmit={enviar}>
      <fieldset disabled={ocupado || !puedeEditar} className={estilos.campos}>
        {accion.tipo === 'eliminar' ? <p>¿Confirmas eliminar la sección {accion.oferta.seccion} de {asignatura.codigo} en {semestre.codigo}? Esta acción no se puede deshacer.</p> : <>
          <label>Sección<select required value={seccion} onChange={e => setSeccion(e.target.value)}>
            {libres.map(n => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <label>Cupos<input type="number" min="0" step="1" required value={cupos} onChange={e => setCupos(e.target.value)} /></label>
          <p>Puedes guardar la sección con profesores pendientes. Cada tipo de hora admite un profesor.</p>
          <EditorAsignaciones key={`${accion.tipo}-${accion.tipo === 'editar' ? accion.oferta.id : 'nueva'}`}
            asignatura={asignatura} profesores={datos.profesores} asignaciones={asignaciones} alCambiar={setAsignaciones} />
        </>}
        <div className={estilos.acciones}>
          <button type="button" className="boton boton--gris" onClick={() => setAccion(null)}>Cancelar</button>
          <button type="submit" className={`boton ${accion.tipo === 'eliminar' ? 'boton--eliminar' : 'boton--azul'}`}>
            {ocupado ? 'Guardando…' : accion.tipo === 'eliminar' ? 'Confirmar eliminación' : 'Guardar sección'}
          </button>
        </div>
      </fieldset>
      {error && <p role="alert" className={estilos.error}>{error}</p>}
    </form>}
  </PanelAsignatura>;
}
