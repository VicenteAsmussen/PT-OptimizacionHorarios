import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { asignaturasApi } from './asignaturas.api';
import { ofertasDelSemestre, prepararOferta, seccionesLibres } from './datos';
import type { Asignatura, Oferta, ProfesorSeccion, Semestre } from './types';
import { useMutacion } from './useMutacion';
import PanelAsignatura from './PanelAsignatura';
import SelectorProfesor from './SelectorProfesor';
import estilos from './Asignaturas.module.css';

type Accion = { tipo: 'editar'; oferta: Oferta } | { tipo: 'crear' } | { tipo: 'eliminar'; oferta: Oferta };
export default function PanelSecciones({ asignatura, semestre, alCerrar, alCambiarOfertas }: {
  asignatura: Asignatura; semestre: Semestre; alCerrar: () => void; alCambiarOfertas: () => void;
}) {
  const [datos, setDatos] = useState<{ ofertas: Oferta[]; profesores: ProfesorSeccion[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [seccion, setSeccion] = useState('');
  const [cupos, setCupos] = useState('0');
  const [profesorId, setProfesorId] = useState<number | null>(null);
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
        ofertas: ofertasDelSemestre(ofertas, asignatura.codigo, semestre.id), profesores,
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
    setAccion(nueva);
    setSeccion(String(nueva.tipo === 'crear' ? libres[0] : nueva.oferta.seccion));
    setCupos(String(nueva.tipo === 'crear' ? 0 : nueva.oferta.cupos));
    setProfesorId(nueva.tipo === 'crear' ? null : nueva.oferta.profesorId);
  }
  function completar() {
    alCambiarOfertas();
    setGuardado(true);
    setAccion(null);
    void cargar();
    contenido.current?.focus();
  }
  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!accion || !datos) return;
    void ejecutar(async () => {
      if (accion.tipo === 'eliminar') {
        await asignaturasApi.eliminarOferta(accion.oferta.id);
      } else {
        const payload = prepararOferta({ seccion, cupos, profesorId }, datos.profesores, libres);
        if (accion.tipo === 'crear') await asignaturasApi.crearOferta(asignatura.codigo, semestre.id, payload);
        else await asignaturasApi.editarOferta(accion.oferta.id, payload);
      }
    }, completar);
  }
  return <PanelAsignatura titulo={`Secciones · ${asignatura.codigo}`} ocupado={ocupado} alCerrar={alCerrar}>
    <p>{asignatura.nombre}</p>
    <p className={estilos.estado}>Semestre seleccionado: <strong>{semestre.codigo}</strong>{semestre.actual ? ' (actual)' : ''}.
      Para cambiarlo, cierra este panel y utiliza el selector de semestre.</p>
    <h3 ref={contenido} tabIndex={-1}>{accion?.tipo === 'crear' ? 'Agregar sección'
      : accion?.tipo === 'editar' ? `Editar sección ${accion.oferta.seccion}`
      : accion?.tipo === 'eliminar' ? `Eliminar sección ${accion.oferta.seccion}` : 'Secciones del semestre'}</h3>
    {cargando && <p role="status">Cargando secciones y profesores…</p>}
    {errorCarga && <div role="alert" className={estilos.error}><p>{errorCarga}</p>
      {guardado && <p>Los cambios ya se guardaron. Reintentar solo actualiza la lista.</p>}
      <button type="button" className="boton" onClick={() => void cargar()}>Reintentar carga</button></div>}
    {datos && !accion && <>
      <p role="status">{datos.ofertas.length} de 5 secciones en {semestre.codigo}</p>
      {!libres.length && <p className={estilos.estado}>Máximo de 5 secciones alcanzado. Elimina una sección sin horarios para liberar su número.</p>}
      <button type="button" className="boton boton--crear" disabled={!libres.length} onClick={() => abrir({ tipo: 'crear' })}>Agregar sección</button>
      {!datos.ofertas.length && <p>No hay secciones para esta asignatura en el semestre seleccionado.</p>}
      <ul className={estilos.secciones}>{datos.ofertas.map(o => <li key={o.id}>
        <h4>Sección {o.seccion}</h4><p>{o.profesor.nombre} · {o.cupos} cupos</p>
        <div className={estilos.acciones}>
          <button type="button" className="boton boton--azul" onClick={() => abrir({ tipo: 'editar', oferta: o })}>Editar sección {o.seccion}</button>
          <button type="button" className="boton boton--eliminar" disabled={Boolean(o.horarios?.length)}
            aria-describedby={o.horarios?.length ? `motivo-horarios-${o.id}` : undefined}
            onClick={() => abrir({ tipo: 'eliminar', oferta: o })}>Eliminar sección {o.seccion}</button>
        </div>
        {Boolean(o.horarios?.length) && <p id={`motivo-horarios-${o.id}`}>No se puede eliminar: tiene horarios asociados.</p>}
      </li>)}</ul>
    </>}
    {datos && accion && <form onSubmit={enviar}>
      <fieldset disabled={ocupado} className={estilos.campos}>
        {accion.tipo === 'eliminar' ? <p>¿Confirmas eliminar la sección {accion.oferta.seccion} de {asignatura.codigo} en {semestre.codigo}? Esta acción no se puede deshacer.</p> : <>
          <label>Sección<select required value={seccion} onChange={e => setSeccion(e.target.value)}>
            {libres.map(n => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <label>Cupos<input type="number" min="0" step="1" required value={cupos} onChange={e => setCupos(e.target.value)} /></label>
          <SelectorProfesor key={`${accion.tipo}-${accion.tipo === 'editar' ? accion.oferta.id : 'nueva'}`}
            profesores={datos.profesores} profesorId={profesorId} alSeleccionar={setProfesorId} />
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
