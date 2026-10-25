import { etiquetaEstado } from './modelo';
import type { ContextoHorario } from './types';
import estilos from './MiHorario.module.css';

interface Propiedades {
  planificaciones: ContextoHorario['planificaciones'];
  planificacionId: number | null;
  seleccionar: (id: number) => void;
}

export default function EncabezadoMiHorario({ planificaciones, planificacionId, seleccionar }: Propiedades) {
  const planificacion = planificaciones.find(p => p.id === planificacionId);
  return <header className={estilos.tarjeta}>
    <h1 id="titulo-mi-horario">Mi horario</h1>
    <p>Consulta tus clases asignadas por carrera y período. Esta página es de solo lectura.</p>
    {planificaciones.length > 0 && <div className={estilos.controles}>
      <label className={estilos.selector}>Carrera y período
        <select value={planificacionId ?? ''} onChange={evento => seleccionar(Number(evento.target.value))}>
          {planificaciones.map(p => <option key={p.id} value={p.id}>{p.carreraNombre} — {p.codigo} — {etiquetaEstado(p)}</option>)}
        </select>
      </label>
      {planificacion && <span className={`${estilos.estado} ${planificacion.estadoPlanificacion === 'publicado' ? estilos.publicado : estilos.propuesta}`}>
        Estado del período: {etiquetaEstado(planificacion)}
      </span>}
    </div>}
  </header>;
}
