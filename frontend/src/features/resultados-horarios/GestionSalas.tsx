import { useRef, useState } from 'react';
import IconoArchivo from '../../components/IconoArchivo';
import { etiquetasSala, etiquetaSesion, puedeEditarResultado, puedeMoverSesion } from './modelo';
import type { ResultadoHorario, SesionResultado } from './types';
import estilos from './SuperficiesResultados.module.css';

export default function GestionSalas({ resultado, ocupado, exportar, importar, seleccionar, verPendientes }: {
  resultado: ResultadoHorario; ocupado: boolean; exportar: (soloPendientes: boolean) => void;
  importar: (archivo: File) => void; seleccionar: (sesion: SesionResultado) => void; verPendientes: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState('');
  const entrada = useRef<HTMLInputElement>(null);
  const editable = puedeEditarResultado(resultado);
  const pendientes = resultado.sesiones.filter(s => s.estadoSala === 'pendiente');
  const elegibles = resultado.sesiones.filter(s => s.estadoSala === 'asignada' || s.estadoSala === 'pendiente');
  const haySalasAsignadas = elegibles.some(sesion => sesion.salas.some(sala => sala !== null));
  const puedeExportarCompleta = elegibles.length > 0 && !haySalasAsignadas;
  const puedeExportarPendiente = haySalasAsignadas && resultado.pendientesSala > 0;
  return <section className={estilos.gestionSalas} aria-labelledby="titulo-salas" aria-busy={ocupado}>
    <header className={estilos.cabeceraSeccion}>
      <h2 id="titulo-salas">Asignación de salas</h2>
      <p><strong>{resultado.pendientesSala} sesiones pendientes</strong> en toda la planificación, sin aplicar el filtro de nivel.</p>
    </header>
    <section className={estilos.seccionSalas} aria-labelledby="titulo-solicitud-salas">
      <h3 id="titulo-solicitud-salas">Solicitud de salas</h3>
      <div className={estilos.acciones}>
        <button type="button" className={`boton ${estilos.accionSecundaria}`} disabled={ocupado || !puedeExportarCompleta} onClick={() => { if (!ocupado && puedeExportarCompleta) exportar(false); }}><IconoArchivo tipo="exportar" />Exportar solicitud</button>
        <button type="button" className={`boton ${estilos.accionSecundaria}`} disabled={ocupado || !puedeExportarPendiente} onClick={() => { if (!ocupado && puedeExportarPendiente) exportar(true); }}><IconoArchivo tipo="exportar" />Exportar pendiente</button>
        <button type="button" className={`boton ${estilos.accionSecundaria}`} aria-haspopup="dialog" disabled={ocupado || !pendientes.length} onClick={() => { if (!ocupado && pendientes.length) verPendientes(); }}>Ver sesiones sin sala</button>
      </div>
      <p className={estilos.ayuda}>Prácticas profesionales, Proyecto de Título, sesiones de laboratorio y horarios externos no se incluyen en la solicitud cuando están exentos.</p>
    </section>
    {editable ? <form className={estilos.importacion} aria-labelledby="titulo-respuesta-salas" onSubmit={evento => {
      evento.preventDefault(); if (archivo && !ocupado) importar(archivo);
    }}>
      <h3 id="titulo-respuesta-salas">Respuesta de salas</h3>
      <p id="ayuda-respuesta-salas" className={estilos.ayuda}>Completa las sesiones pendientes con una sala válida o <strong>SIN SALA</strong>. Las sesiones que ya tienen sala se omiten y conservan su asignación. Una sala vacía en una sesión pendiente provoca el rechazo del archivo.</p>
      <label>Respuesta de salas (.xlsx, máximo 10 MB)<input ref={entrada} name="respuestaSalas" type="file" accept=".xlsx" disabled={ocupado}
        aria-invalid={error ? true : undefined} aria-describedby={`ayuda-respuesta-salas${error ? ' error-respuesta-salas' : ''}`} onChange={evento => {
        const elegido = evento.target.files?.[0] ?? null; setError(''); setArchivo(null);
        if (elegido && (!/\.xlsx$/i.test(elegido.name) || elegido.size > 10 * 1024 * 1024 || elegido.size === 0)) {
          setError('Selecciona un archivo .xlsx no vacío de hasta 10 MB.'); if (entrada.current) entrada.current.value = ''; return;
        }
        setArchivo(elegido);
      }} /></label>
      {error && <p id="error-respuesta-salas" role="alert" className={estilos.error}>{error}</p>}
      <button type="submit" className={`boton ${estilos.accionPrincipal}`} disabled={ocupado || !archivo}><IconoArchivo tipo="importar" />Importar respuesta</button>
    </form> : <p className={estilos.soloLectura}>Solo lectura: no se pueden importar respuestas en este período.</p>}
    {pendientes.length > 0 ? <details className={estilos.detallePendientes}><summary>Identificar sesiones sin sala ({pendientes.length})</summary>
      <ul className={estilos.pendientes}>{pendientes.map(s => <li key={s.idsHorarios[0]}>
        <button type="button" className={`boton ${estilos.accionSecundaria}`} disabled={ocupado || !puedeMoverSesion(resultado, s)}
          onClick={() => { if (!ocupado && puedeMoverSesion(resultado, s)) seleccionar(s); }}>{etiquetaSesion(s)}</button>
        <span>{s.dia} {s.horaInicio.slice(0, 5)}–{s.horaTermino.slice(0, 5)} · {etiquetasSala[s.estadoSala]}</span>
      </li>)}</ul>
    </details> : <p className={estilos.sinPendientes}>No hay sesiones pendientes de sala.</p>}
  </section>;
}
