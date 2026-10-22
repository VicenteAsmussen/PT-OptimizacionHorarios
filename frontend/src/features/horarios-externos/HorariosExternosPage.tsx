import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';
import { planificacionInicial } from '../asignaturas/datos';
import { departamentosExternos, mensajeErrorCobertura, presentacionCobertura } from './datos';
import { horariosExternosApi } from './horarios-externos.api';
import type { CoberturaExterna, DepartamentoExterno, ErrorImportacion, FalloImportacion, PlanificacionSemestre, ResultadoImportacion } from './types';
import base from '../asignaturas/Asignaturas.module.css';
import estilos from './HorariosExternos.module.css';
import ResumenDepartamentos from './ResumenDepartamentos';

export default function HorariosExternosPage() {
  const { usuario } = useAuth();
  return <PaginaImportacion key={usuario?.id} />;
}

function PaginaImportacion() {
  const [datos, setDatos] = useState<{ planificaciones: PlanificacionSemestre[]; departamentos: DepartamentoExterno[] } | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [intento, setIntento] = useState(0);
  const [planificacionId, setPlanificacionId] = useState<number | null>(null);
  const [departamentoId, setDepartamentoId] = useState<number | null>(null);
  const [persistida, setPersistida] = useState<CoberturaExterna[] | null>(null);
  const [errorCobertura, setErrorCobertura] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [errores, setErrores] = useState<ErrorImportacion[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [rechazado, setRechazado] = useState(false);
  const [actualizacion, setActualizacion] = useState(0);
  const enviando = useRef(false);
  const vigente = useRef(true);
  const controlArchivo = useRef<HTMLInputElement>(null);
  const resumen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    vigente.current = true;
    return () => { vigente.current = false; };
  }, []);
  useEffect(() => {
    let activo = true;
    setDatos(null); setErrorCarga('');
    Promise.all([horariosExternosApi.planificaciones(), horariosExternosApi.departamentos()])
      .then(([planificaciones, departamentos]) => {
        if (!activo) return;
        setDatos({ planificaciones, departamentos }); setPlanificacionId(planificacionInicial(planificaciones));
      }).catch(fallo => { if (activo) setErrorCarga(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los datos.'); });
    return () => { activo = false; };
  }, [intento]);
  useEffect(() => {
    let activo = true;
    setPersistida(null); setErrorCobertura('');
    if (planificacionId !== null && departamentoId !== null) {
      horariosExternosApi.cobertura(planificacionId, departamentoId).then(datos => {
        if (activo) setPersistida(datos.cobertura);
      }).catch(fallo => { if (activo) setErrorCobertura(mensajeErrorCobertura(fallo)); });
    }
    return () => { activo = false; };
  }, [planificacionId, departamentoId, actualizacion]);

  function limpiarResultado() {
    setResultado(null); setErrores([]); setMensaje(''); setRechazado(false); setConfirmado(false);
  }
  function limpiarArchivo() {
    setArchivo(null);
    if (controlArchivo.current) controlArchivo.current.value = '';
    limpiarResultado();
  }
  async function importar() {
    if (enviando.current || !archivo || !confirmado || !editable || !persistida || planificacionId === null || departamentoId === null) return;
    enviando.current = true; setImportando(true); setMensaje(''); setResultado(null); setErrores([]); setRechazado(false);
    try {
      const respuesta = await horariosExternosApi.importar(planificacionId, departamentoId, archivo);
      if (!vigente.current) return;
      setResultado(respuesta); setArchivo(null); setConfirmado(false);
      if (controlArchivo.current) controlArchivo.current.value = '';
      setMensaje('Importación completada. Los horarios se guardaron correctamente.');
      setActualizacion(valor => valor + 1);
    } catch (fallo) {
      if (!vigente.current) return;
      const detalle = fallo instanceof ApiError ? fallo.detalle as FalloImportacion | null : null;
      const erroresArchivo = detalle?.errores;
      if (Array.isArray(erroresArchivo)) {
        setErrores(erroresArchivo); setResultado(detalle?.data ?? null); setRechazado(true);
        setMensaje('Importación rechazada. No se guardó ninguna fila ni se modificó la carga anterior. Corrige el archivo y vuelve a enviarlo.');
      } else {
        // A lost response does not prove that the transaction failed.
        setMensaje(`${fallo instanceof Error ? fallo.message : 'No se pudo confirmar la importación.'} Consulta la carga guardada antes de reintentar.`);
        setActualizacion(valor => valor + 1);
      }
    } finally {
      enviando.current = false;
      if (vigente.current) { setImportando(false); resumen.current?.focus(); }
    }
  }

  const planificacion = datos?.planificaciones.find(planificacion => planificacion.actual && planificacion.id === planificacionId);
  const departamentos = useMemo(() => departamentosExternos(datos?.departamentos ?? [], planificacion?.carreraId),
    [datos?.departamentos, planificacion?.carreraId]);
  const editable = !!planificacion?.actual && planificacion.estadoPlanificacion === 'preparacion';
  const coberturaArchivo = resultado && (resultado.cobertura?.length ?? 0) > 0;
  const cobertura = coberturaArchivo ? resultado.cobertura : persistida;
  const faltantes = cobertura?.filter(asignatura => asignatura.estado === 'faltante_obligatoria').length ?? 0;

  return <section className={base.pagina} aria-labelledby="titulo-horarios-externos">
    <header className={base.cabecera}><div>
      <h1 id="titulo-horarios-externos">Horarios departamentos externos</h1>
      <p>Importa el Excel del departamento y revisa la cobertura de asignaturas de la carrera.</p>
    </div></header>
    {!datos && !errorCarga && <p role="status">Cargando planificaciones y departamentos…</p>}
    {errorCarga && <div role="alert" className={base.error}><p>{errorCarga}</p>
      <button type="button" className="boton" onClick={() => setIntento(valor => valor + 1)}>Reintentar carga</button></div>}
    {datos && <>
      <div className={base.filtros}>
        <label>Período actual<select disabled value={planificacionId ?? ''}>
          {planificacionId === null && <option value="" disabled hidden>Período actual no disponible</option>}
          {datos.planificaciones.filter(planificacion => planificacion.actual).map(planificacion => <option key={planificacion.id} value={planificacion.id}>
            {planificacion.carrera.nombre} · {planificacion.codigo}
          </option>)}
        </select></label>
        <label>Departamento externo<select disabled={!planificacion || importando} value={departamentoId ?? ''} onChange={evento => {
          limpiarArchivo(); setPersistida(null); setDepartamentoId(evento.target.value ? Number(evento.target.value) : null);
        }}><option value="">Selecciona un departamento</option>
          {departamentos.map(departamento => <option key={departamento.id} value={departamento.id}>{departamento.nombre}</option>)}
        </select></label>
      </div>
      {!datos.planificaciones.some(planificacion => planificacion.actual) && <p>No hay planificaciones actuales disponibles. Los períodos anteriores se consultan en Asignaturas.</p>}
      {planificacionId === null && datos.planificaciones.filter(planificacion => planificacion.actual).length > 1 && <p role="alert">No se pudo determinar un único período actual para esta cuenta. No se elige una carrera automáticamente.</p>}
      {planificacion && <p>En <strong>{planificacion.codigo}</strong> son obligatorios los niveles {planificacion.codigo.endsWith('-1') ? 'impares' : 'pares'} de la malla. Los demás niveles son opcionales.</p>}
      {planificacion && !departamentos.length && <p>No hay departamentos externos asociados a esta carrera.</p>}
      {planificacion && !editable && <p className={base.estado}>Solo puedes importar en una planificación actual en preparación. La carga guardada sigue disponible para consulta.</p>}
      {planificacion && departamentoId === null && departamentos.length > 0 && <ResumenDepartamentos
        key={planificacion.id} planificacionId={planificacion.id} departamentos={departamentos} />}
      {departamentoId !== null && <>
        {!persistida && !errorCobertura && <p role="status">Consultando carga guardada…</p>}
        {errorCobertura && <div role="alert" className={base.error}><p>{errorCobertura}</p>
          <button type="button" className="boton" disabled={importando} onClick={() => setActualizacion(valor => valor + 1)}>Reintentar consulta</button></div>}
        <form className={estilos.carga} onSubmit={evento => { evento.preventDefault(); void importar(); }}>
          <fieldset disabled={!editable || importando || !persistida || !persistida.length}>
            <legend>Archivo del departamento</legend>
            <label>Excel (.xlsx, máximo 10 MB)<input ref={controlArchivo} type="file" accept=".xlsx" onChange={evento => {
              limpiarResultado();
              const seleccionado = evento.target.files?.[0] ?? null;
              if (seleccionado && (!seleccionado.name.toLowerCase().endsWith('.xlsx') || seleccionado.size > 10 * 1024 * 1024)) {
                setArchivo(null); evento.target.value = ''; setMensaje('Selecciona un archivo .xlsx de hasta 10 MB.'); return;
              }
              setArchivo(seleccionado);
            }} /></label>
            {archivo && <p>Archivo seleccionado: <strong>{archivo.name}</strong></p>}
            <p id="efecto-importacion">El archivo reemplaza las secciones y horarios de este departamento en el período actual de la carrera. Se eliminan las secciones ausentes, incluso de asignaturas opcionales. No se modifica el catálogo.</p>
            <label className={estilos.confirmacion}><input type="checkbox" checked={confirmado} onChange={evento => setConfirmado(evento.target.checked)} aria-describedby="efecto-importacion" />
              Confirmo el reemplazo de la carga de este departamento.</label>
            <button className="boton boton--azul" type="submit" disabled={!archivo || !confirmado || importando}>{importando ? 'Importando…' : 'Importar horarios'}</button>
          </fieldset>
        </form>
        <div ref={resumen} tabIndex={-1} aria-live="polite">
          {mensaje && <p role={rechazado || !resultado ? 'alert' : 'status'} className={rechazado ? base.error : base.estado}>{mensaje}</p>}
          {resultado && !rechazado && <p>{resultado.ofertasCreadas} secciones creadas · {resultado.ofertasActualizadas} actualizadas · {resultado.ofertasEliminadas} eliminadas · {resultado.horariosCreados} bloques guardados.</p>}
        </div>
        {!!errores.length && <div className={base.tablaContenedor} role="region" aria-label="Errores de importación" tabIndex={0}>
          <table className={base.tabla}><caption>Corrige estos errores en el archivo</caption>
            <thead><tr><th>Asignatura</th><th>Fila</th><th>Columna</th><th>Valor</th><th>Detalle</th></tr></thead>
            <tbody>{errores.map((error, indice) => <tr key={indice}><th scope="row">{error.codigoAsignatura ? `${error.codigoAsignatura} · ${error.nombreAsignatura ?? ''}` : 'Archivo'}</th>
              <td>{error.fila || '—'}</td><td>{error.columna}</td><td>{error.valor ?? '—'}</td><td>{error.mensaje}</td></tr>)}</tbody>
          </table>
        </div>}
        {cobertura && <>
          <h2>{coberturaArchivo ? 'Resultado del archivo' : 'Carga guardada'}</h2>
          {rechazado && coberturaArchivo && <p>Este resultado describe el archivo rechazado, no la carga guardada. Ninguna fila del archivo se guardó.</p>}
          <p>{cobertura.filter(asignatura => asignatura.estado === 'cargada').length} asignaturas con horarios · {faltantes} obligatorias faltantes · {cobertura.filter(asignatura => asignatura.estado === 'faltante_opcional').length} opcionales no cargadas.</p>
          {!cobertura.length ? <p>No hay asignaturas de este departamento en la malla de la carrera.</p> : <div className={base.tablaContenedor} role="region" aria-label="Cobertura de asignaturas" tabIndex={0}>
            <table className={base.tabla}><thead><tr><th scope="col">Código</th><th scope="col">Asignatura</th><th scope="col">Nivel semestral</th><th scope="col">Secciones con horarios</th><th scope="col">Estado</th></tr></thead>
              <tbody>{cobertura.map(asignatura => {
                const estado = presentacionCobertura(asignatura.estado, rechazado && !!coberturaArchivo);
                return <tr key={asignatura.codigo} className={estilos[estado.color]}><th scope="row">{asignatura.codigo}</th><td>{asignatura.nombre}</td><td>{asignatura.semestreMalla}</td>
                  <td>{asignatura.secciones.join(', ') || '—'}</td><td>{estado.texto}</td></tr>;
              })}</tbody>
            </table>
          </div>}
          <button type="button" className="boton boton--gris" disabled={importando} onClick={() => { limpiarArchivo(); setActualizacion(valor => valor + 1); }}>Consultar carga guardada</button>
        </>}
      </>}
    </>}
  </section>;
}
