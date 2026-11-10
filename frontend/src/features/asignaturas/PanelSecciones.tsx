import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { asignaturasApi } from './asignaturas.api';
import { estadoSecciones } from '../../lib/periodos';
import { ofertasDePlanificacion, prepararOferta, seccionesLibres, tiposPendientes } from './datos';
import type { Asignatura, Oferta, ProfesorSeccion } from './types';
import type { PlanificacionSemestre } from '../../types/periodos';
import { useMutacion } from './useMutacion';
import PanelAsignatura from './PanelAsignatura';
import SelectorProfesor from './SelectorProfesor';
import estilos from './Asignaturas.module.css';
import { AvisoBloqueo, useBloqueoOptimizacion } from '../optimizacion/SeguimientoOptimizacion';
import { useAuth } from '../../hooks/useAuth';

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
    <div className={`${estilos.tablaContenedor} ${estilos.asignacionesContenedor}`} tabIndex={0} role="region" aria-label="Asignación de profesores por tipo de hora">
      <table className={estilos.tablaAsignaciones} role="table">
        <caption>Profesores por tipo de hora</caption>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Tipo de hora</th><th scope="col" role="columnheader">Horas</th><th scope="col" role="columnheader">Profesor</th></tr></thead>
        <tbody role="rowgroup">{tipos.map(tipo => <tr key={tipo.tipoHoraId} role="row">
          <th scope="row" role="rowheader">{tipo.tipoHora.tipo}</th><td role="cell">{tipo.horas} h</td>
          <td role="cell"><SelectorProfesor profesores={profesores} contexto={tipo.tipoHora.tipo}
            profesorId={asignaciones.find(a => a.tipoHoraId === tipo.tipoHoraId)?.profesorId ?? null}
             alSeleccionar={profesorId => seleccionar(tipo.tipoHoraId, profesorId)} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!tipos.length && <p>No hay tipos de hora con carga para asignar profesores.</p>}
    {tipos.length > 1 && <p className={estilos.ayudaFormulario}>Al elegir el primer profesor se completan los tipos vacíos. Puedes cambiarlos.</p>}
  </>;
}
export default function PanelSecciones(propiedades: Propiedades) {
  const { asignatura, semestre } = propiedades;
  // Cambiar de contexto desmonta formularios y silencia las mutaciones tardías.
  return <ContenidoSecciones key={`${asignatura.codigo}-${semestre.id}-${semestre.actual}-${semestre.estadoPlanificacion}`}
    {...propiedades} />;
}
function ContenidoSecciones({ asignatura, semestre, alCerrar, alCambiarOfertas }: Propiedades) {
  const { usuario } = useAuth();
  const { etiqueta, puedeEditar: editablePorEstado, motivo } = estadoSecciones(semestre);
  const bloqueoModelo = useBloqueoOptimizacion(semestre.id);
  const puedeEditar = usuario?.rol === 'secretaria' && editablePorEstado && !bloqueoModelo;
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
  const { ocupado, error, ejecutar, limpiarError } = useMutacion();
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
        ofertas: ofertasDePlanificacion(ofertas, asignatura.codigo, semestre.id),
        profesores: profesores.filter(profesor => profesor.departamento.id === asignatura.departamentoId),
      });
    } catch (fallo) {
      if (numero === solicitud.current) setErrorCarga(fallo instanceof Error ? fallo.message : 'No se pudieron cargar las secciones.');
    } finally {
      if (numero === solicitud.current) setCargando(false);
    }
  }, [asignatura.codigo, asignatura.departamentoId, semestre.id]);
  useEffect(() => {
    void cargar();
    return () => { solicitud.current++; };
  }, [cargar]);
  useEffect(() => {
    // Cada cambio de vista conserva un destino de foco dentro del único panel.
    contenido.current?.focus();
  }, [accion]);
  const libres = seccionesLibres(datos?.ofertas ?? [], accion?.tipo === 'editar' ? accion.oferta.id : undefined);
  const profesoresNoElegibles = datos && accion?.tipo === 'editar' ? accion.oferta.asignaciones.filter(anterior =>
    asignaciones.some(actual => actual.tipoHoraId === anterior.tipoHoraId && actual.profesorId === anterior.profesorId)
    && !datos.profesores.some(profesor => profesor.id === anterior.profesorId)).map(anterior => anterior.profesor.nombre) : [];
  function abrir(nueva: Accion) {
    if (!vigente.current || !puedeEditar || ocupado) return;
    if (nueva.tipo === 'eliminar' && nueva.oferta.horarios?.length) return;
    limpiarError();
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
    let payload: ReturnType<typeof prepararOferta>;
    void ejecutar(async () => {
      if (accion.tipo === 'eliminar') {
        await asignaturasApi.eliminarOferta(accion.oferta.id);
      } else {
        if (accion.tipo === 'crear') await asignaturasApi.crearOferta(asignatura.codigo, semestre.id, payload);
        else await asignaturasApi.editarOferta(accion.oferta.id, payload);
      }
    }, completar, () => {
      if (accion.tipo !== 'eliminar') payload = prepararOferta({ seccion, cupos, asignaciones }, datos.profesores, libres);
    });
  }
  return <PanelAsignatura titulo={`Secciones · ${asignatura.codigo}`} ocupado={ocupado} alCerrar={alCerrar}>
    <div className={estilos.contextoPanel}>
      <p className={estilos.nombreAsignatura}>{asignatura.nombre}</p>
      <p>Semestre seleccionado: <strong>{semestre.carrera.nombre} · {semestre.codigo}</strong>{semestre.actual ? ' (actual)' : ''} · {etiqueta}.</p>
      <p className={estilos.ayudaFormulario}>Para cambiar el período, vuelve al selector de Asignaturas.</p>
    </div>
    {motivo && <p id="motivo-secciones" role="status" className={estilos.estado}>{motivo}</p>}
    {usuario?.rol === 'admin' && <p role="status">Solo consulta: las secciones y asignaciones las gestiona secretaría.</p>}
    <AvisoBloqueo bloqueado={bloqueoModelo} />
    {(!datos || !accion) && <h3 ref={contenido} tabIndex={-1}>Secciones del semestre</h3>}
    {cargando && <p role="status">Cargando secciones y profesores…</p>}
    {errorCarga && <div role="alert" className={estilos.error}><p>{errorCarga}</p>
      {guardado && <p>Los cambios ya se guardaron. Reintentar solo actualiza la lista.</p>}
      <button type="button" className="boton" onClick={() => void cargar()}>Reintentar carga</button></div>}
    {datos && !accion && <>
      <div className={estilos.cabeceraSecciones}>
        <p role="status">{datos.ofertas.length} de 5 secciones</p>
        <button type="button" className="boton boton--crear" disabled={!puedeEditar || !libres.length} aria-describedby={motivo ? 'motivo-secciones' : undefined} onClick={() => abrir({ tipo: 'crear' })}>Agregar sección</button>
      </div>
      {puedeEditar && !libres.length && <p className={estilos.estado}>Máximo de 5 secciones alcanzado. Elimina una sección sin horarios para liberar su número.</p>}
      {!datos.ofertas.length && <p>No hay secciones para esta asignatura en el semestre seleccionado.</p>}
      <ul className={estilos.secciones}>{datos.ofertas.map(o => <li key={o.id}>
        <h4>Sección {o.seccion}</h4><p>{o.cupos} cupos</p>
        <ul>{o.asignaciones.map(a => <li key={a.tipoHoraId}>{a.tipoHora.tipo}: {a.profesor.nombre}</li>)}</ul>
        {tiposPendientes(asignatura, o).length > 0 && <p role="status">Falta asignar profesor: {tiposPendientes(asignatura, o).map(t => t.tipoHora.tipo).join(', ')}.</p>}
        <div className={estilos.acciones}>
          <button type="button" className="boton boton--azul" disabled={!puedeEditar} aria-label={`Editar sección ${o.seccion}`} aria-describedby={motivo ? 'motivo-secciones' : undefined} onClick={() => abrir({ tipo: 'editar', oferta: o })}>Editar</button>
          <button type="button" className="boton boton--eliminar" disabled={!puedeEditar || Boolean(o.horarios?.length)} aria-label={`Eliminar sección ${o.seccion}`}
            aria-describedby={[motivo ? 'motivo-secciones' : '', o.horarios?.length ? `motivo-horarios-${o.id}` : ''].filter(Boolean).join(' ') || undefined}
            onClick={() => abrir({ tipo: 'eliminar', oferta: o })}>Eliminar</button>
        </div>
        {Boolean(o.horarios?.length) && <p id={`motivo-horarios-${o.id}`}>No se puede eliminar: tiene horarios asociados.</p>}
      </li>)}</ul>
    </>}
    {datos && accion && <form onSubmit={enviar} onChange={limpiarError} className={accion.tipo !== 'eliminar' ? estilos.tarjetaSeccion : undefined}>
      <h3 ref={contenido} tabIndex={-1}>{accion.tipo === 'crear' ? 'Agregar sección'
        : accion.tipo === 'editar' ? `Editar sección ${accion.oferta.seccion}` : `Eliminar sección ${accion.oferta.seccion}`}</h3>
      <fieldset disabled={ocupado || !puedeEditar} className={estilos.campos}>
        {accion.tipo === 'eliminar' ? <p className={estilos.avisoConfirmacion}>¿Confirmas eliminar la sección <strong>{accion.oferta.seccion}</strong> de <strong>{asignatura.codigo}</strong> en {semestre.codigo}? Esta acción no se puede deshacer.</p> : <>
          <label>Sección<select required value={seccion} onChange={e => setSeccion(e.target.value)}>
            {libres.map(n => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <label>Cupos<input type="number" min="0" step="1" required value={cupos} onChange={e => setCupos(e.target.value)} /></label>
          <div className={estilos.ayudaFormulario}>
            <p>Puedes guardar con profesores pendientes. Cada tipo de hora admite un profesor.</p>
            <p>Solo se permiten profesores del departamento de la asignatura.</p>
          </div>
          {profesoresNoElegibles.length > 0 && <p role="alert" className={estilos.error}>
            Profesores de otro departamento: {profesoresNoElegibles.join(', ')}. Reemplaza esas asignaciones o limpia sus campos antes de guardar.
          </p>}
          <EditorAsignaciones key={`${accion.tipo}-${accion.tipo === 'editar' ? accion.oferta.id : 'nueva'}`}
            asignatura={asignatura} profesores={datos.profesores} asignaciones={asignaciones}
            alCambiar={valor => { limpiarError(); setAsignaciones(valor); }} />
        </>}
        <div className={`${estilos.acciones} ${estilos.pieFormulario}`}>
          <button type="button" className={`boton boton--gris ${estilos.accionSecundaria}`} onClick={() => { limpiarError(); setAccion(null); }}>Cancelar</button>
          <button type="submit" className={`boton ${accion.tipo === 'eliminar' ? 'boton--eliminar' : estilos.accionPrincipal}`}>
            {ocupado ? 'Guardando…' : accion.tipo === 'eliminar' ? 'Confirmar eliminación' : 'Guardar sección'}
          </button>
        </div>
      </fieldset>
      {error && <p role="alert" className={estilos.error}>{error}</p>}
    </form>}
  </PanelAsignatura>;
}
