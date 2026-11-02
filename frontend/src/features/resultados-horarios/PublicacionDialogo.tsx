import { useEffect, useState } from 'react';
import { resultadosHorariosApi } from './resultados-horarios.api';
import { puedePublicar } from './modelo';
import type { Problema, ResultadoHorario, ValidacionPublicacion } from './types';
import Dialogo from './Dialogo';
import estilos from './ResultadosHorarios.module.css';

function desglosarSalas(resultado: ResultadoHorario, problemas: Problema[]) {
  const idsSinSala = new Set(problemas.filter(p => p.codigo === 'sala').flatMap(p => p.idsHorarios ?? []));
  const sesionesSinSala = resultado.sesiones.filter(s => s.idsHorarios.some(id => idsSinSala.has(id)));
  const idsIdentificados = new Set(sesionesSinSala.flatMap(s => s.idsHorarios));
  const problemasRestantes = problemas.filter(p => p.codigo !== 'sala' || !p.idsHorarios?.length
    || p.idsHorarios.some(id => !idsIdentificados.has(id)));
  return { sesionesSinSala, problemasRestantes };
}

export default function PublicacionDialogo({ resultado, ocupado, cerrar, confirmar }: {
  resultado: ResultadoHorario; ocupado: boolean; cerrar: () => void; confirmar: (revision: string) => void;
}) {
  const [validacion, setValidacion] = useState<ValidacionPublicacion | null>(null);
  const [error, setError] = useState('');
  const { sesionesSinSala, problemasRestantes } = desglosarSalas(resultado, validacion?.problemas ?? []);
  useEffect(() => {
    let activo = true;
    const controlador = new AbortController();
    resultadosHorariosApi.validarPublicacion(resultado.planificacion.id, controlador.signal)
      .then(datos => { if (activo) setValidacion(datos); })
      .catch(fallo => { if (activo) setError(fallo instanceof Error ? fallo.message : 'No se pudo validar la publicación.'); });
    return () => { activo = false; controlador.abort(); };
  }, [resultado.planificacion.id, resultado.revision]);
  return <Dialogo titulo="Publicar horario" ocupado={ocupado} cerrar={cerrar}>
    {error ? <p role="alert" className={estilos.error}>{error}</p> : !validacion ? <p role="status">Validando publicación…</p> : <>
      {validacion.revision !== resultado.revision && <p role="alert">El horario cambió. Cierra y actualiza antes de publicar.</p>}
      {validacion.problemas.length > 0 && <>
        <h3>Problemas que impiden publicar</h3>
        {sesionesSinSala.length > 0 && <>
          <h4>Asignaturas sin sala</h4>
          <ul aria-label="Sesiones sin sala">{sesionesSinSala.map(sesion => <li key={sesion.idsHorarios.join(',')}>
            <strong>{sesion.asignatura.codigo} — {sesion.asignatura.nombre}</strong>
            <p>Semestre {sesion.asignatura.semestreMalla} · Sección {sesion.seccion} · {sesion.tipoHora.tipo}</p>
            <p>{sesion.dia} {sesion.horaInicio.slice(0, 5)}–{sesion.horaTermino.slice(0, 5)}</p>
          </li>)}</ul>
        </>}
        {problemasRestantes.length > 0 && <>
          {sesionesSinSala.length > 0 && <h4>Otros problemas</h4>}
          <ul>{problemasRestantes.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
        </>}
      </>}
      {puedePublicar(resultado, validacion) && <>
        <p role="status">Todos los horarios cargados que requieren sala tienen una sala asignada.</p>
        <p>El horario está listo. Al publicarlo quedará en solo lectura; no se puede reabrir desde esta página.</p>
      </>}
    </>}
    <button type="button" className="boton boton--azul" disabled={ocupado || !puedePublicar(resultado, validacion)} onClick={() => {
      if (puedePublicar(resultado, validacion)) confirmar(resultado.revision);
    }}>{ocupado ? 'Publicando…' : 'Confirmar publicación'}</button>
  </Dialogo>;
}
