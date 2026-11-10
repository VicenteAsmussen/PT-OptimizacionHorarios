import { useEffect, useState } from 'react';
import { useDesbordamientoTabla } from '../../hooks/useDesbordamientoTabla';
import { cargarResumenDepartamentos, mensajeErrorCobertura } from './datos';
import { horariosExternosApi } from './horarios-externos.api';
import type { DepartamentoExterno, ResumenDepartamento } from './types';
import base from '../../styles/paginas.module.css';
import estilos from './HorariosExternos.module.css';

type EstadoResumen = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; filas: ResumenDepartamento[] };

export default function ResumenDepartamentos({ planificacionId, departamentos }: {
  planificacionId: number; departamentos: DepartamentoExterno[];
}) {
  const [estado, setEstado] = useState<EstadoResumen>({ tipo: 'cargando' });
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let activo = true;
    setEstado({ tipo: 'cargando' });
    cargarResumenDepartamentos(planificacionId, departamentos, horariosExternosApi.cobertura)
      .then(filas => { if (activo) setEstado({ tipo: 'listo', filas }); })
      .catch(fallo => { if (activo) setEstado({ tipo: 'error', mensaje: mensajeErrorCobertura(fallo) }); });
    return () => { activo = false; };
  }, [planificacionId, departamentos, intento]);
  return <VistaResumenDepartamentos estado={estado} alReintentar={() => setIntento(valor => valor + 1)} />;
}

export function VistaResumenDepartamentos({ estado, alReintentar }: { estado: EstadoResumen; alReintentar: () => void }) {
  const { referencia, desborda } = useDesbordamientoTabla();
  return <section aria-labelledby="titulo-resumen-departamentos">
    <h2 id="titulo-resumen-departamentos">Resumen de departamentos externos</h2>
    <p>Asignaturas con horarios guardados en el período actual de la carrera.</p>
    {estado.tipo === 'cargando' && <p role="status">Cargando resumen de departamentos…</p>}
    {estado.tipo === 'error' && <div role="alert" className={base.error}>
      <p>No se pudo cargar el resumen. {estado.mensaje}</p>
      <button className="boton" type="button" onClick={alReintentar}>Reintentar resumen</button>
    </div>}
    {estado.tipo === 'listo' && <>
    {desborda && <p id="ayuda-resumen-departamentos" className={base.ayudaTabla}>Desplaza la tabla para ver más columnas.<span className={base.soloLectores}> Con la tabla enfocada, usa las flechas del teclado.</span></p>}
    <div className={estilos.tablaContenedor} role="region" aria-label="Resumen de departamentos externos" tabIndex={0}
      ref={referencia} aria-describedby={desborda ? 'ayuda-resumen-departamentos' : undefined}>
      <table className={`${estilos.tabla} ${estilos.tablaResumen}`}><thead><tr><th scope="col">Departamento externo</th><th scope="col">Asignaturas con horarios</th></tr></thead>
        <tbody>{estado.filas.map(fila => <tr key={fila.departamentoId}>
          <th scope="row">{fila.nombre}</th><td>{fila.cargadas} de {fila.total}</td>
        </tr>)}</tbody>
      </table>
    </div></>}
  </section>;
}
