import { useEffect, useState } from 'react';
import { resultadosHorariosApi } from './resultados-horarios.api';
import { puedePublicar } from './modelo';
import IconoArchivo from '../../components/IconoArchivo';
import type { Problema, ResultadoHorario, ValidacionPublicacion } from './types';
import Dialogo from './Dialogo';
import estilos from './SuperficiesResultados.module.css';

function desglosarSalas(resultado: ResultadoHorario, problemas: Problema[]) {
  const idsSinSala = new Set(problemas.filter(p => p.codigo === 'sala').flatMap(p => p.idsHorarios ?? []));
  const sesionesSinSala = resultado.sesiones.filter(s => s.idsHorarios.some(id => idsSinSala.has(id)));
  const idsIdentificados = new Set(sesionesSinSala.flatMap(s => s.idsHorarios));
  const problemasRestantes = problemas.filter(p => p.codigo !== 'sala' || !p.idsHorarios?.length
    || p.idsHorarios.some(id => !idsIdentificados.has(id)));
  return { sesionesSinSala, problemasRestantes };
}

function desglosarReservas(resultado: ResultadoHorario, problemas: Problema[]) {
  const reservas = problemas.filter(p => p.codigo === 'bloqueReservado');
  const sesionesReservadas = resultado.sesiones.filter(sesion => reservas.some(p =>
    p.idsHorarios?.some(id => sesion.idsHorarios.includes(id)))).map(sesion => {
      const bloquesIds = new Set(reservas.filter(p => p.idsHorarios?.some(id => sesion.idsHorarios.includes(id)))
        .flatMap(p => p.bloqueId !== undefined && sesion.bloquesIds.includes(p.bloqueId) ? [p.bloqueId]
          : (p.idsHorarios ?? []).filter(id => sesion.idsHorarios.includes(id)).map(id => sesion.bloquesIds[sesion.idsHorarios.indexOf(id)])));
      const bloques = resultado.bloques.filter(b => bloquesIds.has(b.id)).sort((a, b) => a.numeroBloque - b.numeroBloque);
      return { sesion, bloques };
    });
  const identificados = new Set(sesionesReservadas.flatMap(({ sesion }) => sesion.idsHorarios));
  return { sesionesReservadas, problemasRestantes: problemas.filter(p => p.codigo !== 'bloqueReservado'
    || !p.idsHorarios?.length || p.idsHorarios.some(id => !identificados.has(id))) };
}

export default function PublicacionDialogo({ resultado, ocupado, cerrar, confirmar }: {
  resultado: ResultadoHorario; ocupado: boolean; cerrar: () => void; confirmar: (revision: string) => void;
}) {
  const [validacion, setValidacion] = useState<ValidacionPublicacion | null>(null);
  const [error, setError] = useState('');
  const { sesionesSinSala, problemasRestantes: sinSalas } = desglosarSalas(resultado, validacion?.problemas ?? []);
  const { sesionesReservadas, problemasRestantes } = desglosarReservas(resultado, sinSalas);
  useEffect(() => {
    let activo = true;
    const controlador = new AbortController();
    resultadosHorariosApi.validarPublicacion(resultado.planificacion.id, controlador.signal)
      .then(datos => { if (activo) setValidacion(datos); })
      .catch(fallo => { if (activo) setError(fallo instanceof Error ? fallo.message : 'No se pudo validar la publicación.'); });
    return () => { activo = false; controlador.abort(); };
  }, [resultado.planificacion.id, resultado.revision]);
  return <Dialogo titulo="Publicar horario" ocupado={ocupado} cerrar={cerrar}>
    <div data-dialogo-publicacion className={estilos.publicacion}>
    {error ? <p role="alert" className={estilos.error}>{error}</p> : !validacion ? <p role="status">Validando publicación…</p> : <>
      {validacion.revision !== resultado.revision && <p role="alert">El horario cambió. Cierra y actualiza antes de publicar.</p>}
      {validacion.problemas.length > 0 && <>
        <h3>Problemas que impiden publicar</h3>
        {sesionesSinSala.length > 0 && <>
          <h4>Asignaturas sin sala</h4>
          <ul className={estilos.tarjetasPendientes} aria-label="Sesiones sin sala">{sesionesSinSala.map(sesion => <li key={sesion.idsHorarios.join(',')}>
            <article className={estilos.tarjeta} aria-label={`${sesion.asignatura.codigo} — ${sesion.asignatura.nombre}, ${sesion.tipoHora.tipo}, ${sesion.dia} ${sesion.horaInicio.slice(0, 5)}–${sesion.horaTermino.slice(0, 5)}`}>
              <h5>{sesion.asignatura.codigo} — {sesion.asignatura.nombre}</h5>
              <p>Semestre {sesion.asignatura.semestreMalla} · Sección {sesion.seccion} · {sesion.tipoHora.tipo}</p>
              <p>{sesion.dia} {sesion.horaInicio.slice(0, 5)}–{sesion.horaTermino.slice(0, 5)}</p>
            </article>
          </li>)}</ul>
        </>}
        {sesionesReservadas.length > 0 && <>
          <h4>Sesiones en bloques reservados</h4>
          <ul className={estilos.tarjetasPendientes} aria-label="Sesiones en bloques reservados">{sesionesReservadas.map(({ sesion, bloques }) => <li key={sesion.idsHorarios.join(',')}>
            <article className={estilos.tarjeta} aria-label={`${sesion.asignatura.codigo} — ${sesion.asignatura.nombre}, ${sesion.tipoHora.tipo}, ${sesion.dia} ${sesion.horaInicio.slice(0, 5)}–${sesion.horaTermino.slice(0, 5)}`}>
              <h5>{sesion.asignatura.codigo} — {sesion.asignatura.nombre}</h5>
              <p>Semestre {sesion.asignatura.semestreMalla} · Sección {sesion.seccion} · {sesion.tipoHora.tipo}</p>
              <p>{sesion.dia} {sesion.horaInicio.slice(0, 5)}–{sesion.horaTermino.slice(0, 5)}</p>
              {bloques.length > 0 && <div className={estilos.horariosReservados} aria-label="Horarios reservados">
                <strong>Horario reservado</strong>
                {bloques.map(bloque => <p key={bloque.id}>{bloque.dia} {bloque.horaInicio.slice(0, 5)}–{bloque.horaTermino.slice(0, 5)}</p>)}
              </div>}
            </article>
          </li>)}</ul>
        </>}
        {problemasRestantes.length > 0 && <>
          {(sesionesSinSala.length > 0 || sesionesReservadas.length > 0) && <h4>Otros problemas</h4>}
          <ul>{problemasRestantes.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
        </>}
      </>}
      {puedePublicar(resultado, validacion) && <>
        <p role="status">Todas las asignaturas que requieren sala tienen una asignada.</p>
        <p>Al publicarlo quedará en solo lectura.</p>
      </>}
    </>}
    </div>
    <button type="button" className={`boton ${estilos.accionPrincipal}`} disabled={ocupado || !puedePublicar(resultado, validacion)} onClick={() => {
      if (puedePublicar(resultado, validacion)) confirmar(resultado.revision);
    }}><IconoArchivo tipo="publicar" />{ocupado ? 'Publicando…' : 'Confirmar publicación'}</button>
  </Dialogo>;
}
