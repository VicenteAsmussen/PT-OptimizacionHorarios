import { ordenarDisponibilidad } from './modelo';
import type { Diagnostico, Disponibilidad } from './types';

export function DisponibilidadOptimizacion({ filas }: { filas: Disponibilidad[] }) {
  if (!filas.length) return null;
  return <details><summary>Disponibilidad docente, de menor a mayor</summary>
    <p>Es una ayuda operativa, no identifica responsables ni garantiza que ampliar la disponibilidad resuelva el problema.</p>
    <div className="tabla-optimizacion"><table><caption>Bloques disponibles después de reservas</caption>
      <thead><tr><th scope="col">Docente</th><th scope="col">Bloques disponibles</th></tr></thead>
      <tbody>{ordenarDisponibilidad(filas).map(f => <tr key={f.profesorId}><th scope="row">Docente {f.profesorId}</th><td>{f.bloquesDisponibles}</td></tr>)}</tbody>
    </table></div>
  </details>;
}
export default function DiagnosticoOptimizacion({ datos, resumirAplicada = false }: { datos: Diagnostico | null; resumirAplicada?: boolean }) {
  if (!datos) return null;
  const faltantes = datos.faltantes?.filter(f => f.horas > 0) ?? [];
  const mensajeResumido = resumirAplicada && datos.codigo === 'aplicada'
    && datos.mensaje === 'Solución completa, válida y vigente incorporada como Propuesta. No está publicada.';
  return <section aria-label="Diagnóstico de la ejecución">
    {datos.mensaje && !mensajeResumido && <p>{datos.mensaje}</p>}
    {datos.fase && <details><summary>Fase de la ejecución</summary><p>Fase informada por el backend: {datos.fase}.</p></details>}
    {datos.errores && datos.errores.length > 0 && <ul>{datos.errores.map((error, i) => <li key={i}>{error}</li>)}</ul>}
    {faltantes.length > 0 && <><h3>Carga pendiente por componente</h3><div className="tabla-optimizacion"><table>
      <thead><tr><th scope="col">Asignatura</th><th scope="col">Sección</th><th scope="col">Componente</th><th scope="col">Bloques faltantes</th></tr></thead>
      <tbody>{faltantes.map(f => <tr key={`${f.ofertaId}-${f.tipoHoraId}`}><th scope="row">{f.asignaturaCodigo}</th><td>{f.seccion}</td><td>{f.componente ?? `Tipo ${f.tipoHoraId}`}</td><td>{f.horas}</td></tr>)}</tbody>
    </table></div></>}
    <DisponibilidadOptimizacion filas={datos.disponibilidadDocente ?? []} />
    {datos.certificadoPrioridad?.prioridadCertificada === false && <details><summary>Detalle de prioridad de carga</summary><p>La cota de esta entrada no certifica prioridad estricta de carga. Esto no demuestra infactibilidad y no modifica pesos ni restricciones.</p></details>}
  </section>;
}
