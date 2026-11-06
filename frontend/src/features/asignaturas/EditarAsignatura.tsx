import { useState, type FormEvent } from 'react';
import { asignaturasApi } from './asignaturas.api';
import type { Asignatura, Departamento } from './types';
import { useMutacion } from './useMutacion';
import PanelAsignatura from './PanelAsignatura';
import estilos from './Asignaturas.module.css';

export default function EditarAsignatura({ asignatura, departamentos, alCerrar, alCompletar, soloLectura = false }: {
  asignatura: Asignatura; departamentos: Departamento[]; alCerrar: () => void; alCompletar: () => void;
  soloLectura?: boolean;
}) {
  const [nombre, setNombre] = useState(asignatura.nombre);
  const [departamentoId, setDepartamentoId] = useState(asignatura.departamentoId);
  const [semestreMalla, setSemestreMalla] = useState(asignatura.semestreMalla);
  const [esCritica, setEsCritica] = useState(asignatura.esCritica);
  const { ocupado, error, ejecutar } = useMutacion();
  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (soloLectura) return;
    void ejecutar(async () => {
      if (!nombre.trim()) throw new Error('Ingresa el nombre de la asignatura.');
      if (!departamentos.some(d => d.id === departamentoId)) throw new Error('Selecciona un departamento válido.');
      if (!Number.isInteger(semestreMalla) || semestreMalla < 1 || semestreMalla > 14) throw new Error('El semestre de malla debe estar entre 1 y 14.');
      await asignaturasApi.editar(asignatura.codigo, { nombre: nombre.trim(), departamentoId, semestreMalla, esCritica });
    }, alCompletar);
  }
  return <PanelAsignatura titulo={soloLectura ? 'Ver asignatura' : 'Editar asignatura'} ocupado={ocupado} alCerrar={alCerrar}>
    {soloLectura ? <section className={estilos.identidad} aria-label="Identificación de la asignatura">
      <h3 className={estilos.nombreIdentidad}>{asignatura.nombre}</h3>
      <p>{asignatura.departamento.nombre}</p>
      <p className={estilos.codigoIdentidad}>Código: <strong>{asignatura.codigo}</strong></p>
    </section> : <p>Código: <strong>{asignatura.codigo}</strong> (no modificable)</p>}
    {soloLectura && <dl className={estilos.detalleAsignatura}>
      <div><dt>Semestre de malla</dt><dd>{asignatura.semestreMalla}</dd></div>
      <div><dt>Asignatura crítica</dt><dd>{asignatura.esCritica ? 'Sí' : 'No'}</dd></div>
    </dl>}
    <section aria-label="Horas por tipo" className={estilos.resumenHoras}>
      <h3>Horas por tipo</h3>
      {asignatura.tiposHora?.length ? <dl>{asignatura.tiposHora.map(tipo => <div key={tipo.tipoHoraId}>
        <dt>{tipo.tipoHora.tipo}</dt><dd>{tipo.horas} h</dd>
      </div>)}</dl> : <p>Sin tipos de hora registrados.</p>}
    </section>
    {!soloLectura && <form onSubmit={enviar}>
      <fieldset disabled={ocupado} className={`${estilos.campos} ${estilos.camposAsignatura}`}>
        <label className={estilos.campoCompleto}>Nombre<input required value={nombre} onChange={e => setNombre(e.target.value)} /></label>
        <label className={estilos.campoCompleto}>Departamento<select required value={departamentoId} onChange={e => setDepartamentoId(Number(e.target.value))}>
          {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select></label>
        <label>Semestre de malla<input type="number" required min="1" max="14" step="1" value={semestreMalla}
          onChange={e => setSemestreMalla(Number(e.target.value))} /></label>
        <label className={estilos.casilla}><input type="checkbox" checked={esCritica} onChange={e => setEsCritica(e.target.checked)} />Asignatura crítica</label>
        <p className={`${estilos.ayudaFormulario} ${estilos.campoCompleto}`}>Se conservan las carreras y los tipos de hora asociados.</p>
        <div className={`${estilos.acciones} ${estilos.pieFormulario} ${estilos.campoCompleto}`}>
          <button className={`boton boton--gris ${estilos.accionSecundaria}`} type="button" onClick={alCerrar}>Cancelar</button>
          <button className={`boton ${estilos.accionPrincipal}`} type="submit">{ocupado ? 'Guardando…' : 'Guardar asignatura'}</button>
        </div>
      </fieldset>
      {error && <p role="alert" className={estilos.error}>{error}</p>}
    </form>}
  </PanelAsignatura>;
}
