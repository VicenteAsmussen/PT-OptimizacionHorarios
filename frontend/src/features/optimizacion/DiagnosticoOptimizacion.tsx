import { ordenarDisponibilidad } from './modelo';
import type { Diagnostico, Disponibilidad } from './types';

export interface CatalogoNombresDocentes {
  estado: 'cargando' | 'disponible' | 'error';
  nombres: Record<number, string>;
}

export function DisponibilidadOptimizacion({ filas, titulo = 'Disponibilidad docente', catalogoDocentes, secundaria = false }: {
  filas: Disponibilidad[]; titulo?: string; catalogoDocentes?: CatalogoNombresDocentes; secundaria?: boolean;
}) {
  if (!filas.length) return null;
  return <details className={secundaria ? 'disponibilidad-historica-modelo' : undefined}><summary>{titulo}</summary>
    <p>Ordenada de menor a mayor. Es una ayuda operativa, no identifica responsables ni garantiza que ampliar la disponibilidad resuelva el problema.</p>
    <p className="ayuda-nombres-modelo" aria-live="polite">{catalogoDocentes?.estado === 'cargando' ? 'Consultando nombres de docentes… ' : ''}Los nombres corresponden al catálogo actual, no a un registro histórico.
      {catalogoDocentes?.estado === 'error' && ' No se pudieron consultar los nombres. Se conservan los identificadores y los bloques disponibles.'}</p>
    <div className="tabla-optimizacion tabla-disponibilidad-modelo" role="region" aria-label={titulo} tabIndex={0}><table><caption>Bloques disponibles después de reservas</caption>
      <thead><tr><th scope="col">Docente</th><th scope="col" className="numero-modelo">Bloques disponibles</th></tr></thead>
      <tbody>{ordenarDisponibilidad(filas).map(f => <tr key={f.profesorId}><th scope="row">{catalogoDocentes?.nombres[f.profesorId] || `${catalogoDocentes?.estado === 'cargando' ? 'Consultando nombre' : 'Nombre no disponible'} · ID ${f.profesorId}`}</th><td className="numero-modelo">{f.bloquesDisponibles}</td></tr>)}</tbody>
    </table></div>
  </details>;
}
export default function DiagnosticoOptimizacion({ datos, resumirAplicada = false, catalogoDocentes, disponibilidadSecundaria = false }: {
  datos: Diagnostico | null; resumirAplicada?: boolean; catalogoDocentes?: CatalogoNombresDocentes; disponibilidadSecundaria?: boolean;
}) {
  if (!datos) return null;
  const faltantes = datos.faltantes?.filter(f => f.horas > 0) ?? [];
  const mensajeResumido = resumirAplicada && datos.codigo === 'aplicada'
    && datos.mensaje === 'Solución completa, válida y vigente incorporada como Propuesta. No está publicada.';
  return <section className="diagnostico-modelo" aria-label="Diagnóstico de la ejecución">
    {datos.mensaje && !mensajeResumido && <p>{datos.mensaje}</p>}
    {datos.fase && <details><summary>Etapa del cálculo</summary><p>Etapa informada por el sistema: {datos.fase}.</p></details>}
    {datos.errores && datos.errores.length > 0 && <ul>{datos.errores.map((error, i) => <li key={i}>{error}</li>)}</ul>}
    {faltantes.length > 0 && <><h3>Bloques pendientes</h3><div className="tabla-optimizacion" role="region" aria-label="Bloques pendientes" tabIndex={0}><table>
      <caption className="solo-lectores-modelo">Bloques pendientes por asignatura, sección y componente</caption>
      <thead><tr><th scope="col">Asignatura</th><th scope="col">Sección</th><th scope="col">Componente</th><th scope="col" className="numero-modelo">Bloques faltantes</th></tr></thead>
      <tbody>{faltantes.map(f => <tr key={`${f.ofertaId}-${f.tipoHoraId}`}><th scope="row">{f.asignaturaCodigo}</th><td>{f.seccion}</td><td>{f.componente ?? `Tipo ${f.tipoHoraId}`}</td><td className="numero-modelo">{f.horas}</td></tr>)}</tbody>
    </table></div></>}
    <DisponibilidadOptimizacion filas={datos.disponibilidadDocente ?? []} catalogoDocentes={catalogoDocentes} secundaria={disponibilidadSecundaria}
      titulo={disponibilidadSecundaria ? 'Detalle de disponibilidad del intento anterior' : 'Disponibilidad considerada en la ejecución'} />
    {datos.certificadoPrioridad?.prioridadCertificada === false && <details><summary>Detalle del análisis de carga</summary><p>El análisis de esta entrada no permite certificar que completar la carga tenga prioridad estricta sobre las preferencias del horario. Esto no significa que sea imposible generar una solución y no modifica los pesos ni las restricciones del modelo.</p></details>}
  </section>;
}
