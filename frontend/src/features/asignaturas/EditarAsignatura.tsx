import { useState, type FormEvent } from 'react';
import { asignaturasApi } from './asignaturas.api';
import type { Asignatura, Departamento } from './types';
import { useMutacion } from './useMutacion';
import PanelAsignatura from './PanelAsignatura';
import estilos from './Asignaturas.module.css';

export default function EditarAsignatura({ asignatura, departamentos, alCerrar, alCompletar }: {
  asignatura: Asignatura; departamentos: Departamento[]; alCerrar: () => void; alCompletar: () => void;
}) {
  const [nombre, setNombre] = useState(asignatura.nombre);
  const [departamentoId, setDepartamentoId] = useState(asignatura.departamentoId);
  const [semestreMalla, setSemestreMalla] = useState(asignatura.semestreMalla);
  const [esCritica, setEsCritica] = useState(asignatura.esCritica);
  const { ocupado, error, ejecutar } = useMutacion();
  function enviar(evento: FormEvent) {
    evento.preventDefault();
    void ejecutar(async () => {
      if (!nombre.trim()) throw new Error('Ingresa el nombre de la asignatura.');
      if (!departamentos.some(d => d.id === departamentoId)) throw new Error('Selecciona un departamento válido.');
      if (!Number.isInteger(semestreMalla) || semestreMalla < 1 || semestreMalla > 14) throw new Error('El semestre de malla debe estar entre 1 y 14.');
      await asignaturasApi.editar(asignatura.codigo, { nombre: nombre.trim(), departamentoId, semestreMalla, esCritica });
    }, alCompletar);
  }
  return <PanelAsignatura titulo="Editar asignatura" ocupado={ocupado} alCerrar={alCerrar}>
    <p>Código: <strong>{asignatura.codigo}</strong> (no modificable)</p>
    <section aria-label="Horas por tipo" className={estilos.resumenHoras}>
      <h3>Horas por tipo</h3>
      {asignatura.tiposHora?.length ? <dl>{asignatura.tiposHora.map(tipo => <div key={tipo.tipoHoraId}>
        <dt>{tipo.tipoHora.tipo}</dt><dd>{tipo.horas} h</dd>
      </div>)}</dl> : <p>Sin tipos de hora registrados.</p>}
    </section>
    <form onSubmit={enviar}>
      <fieldset disabled={ocupado} className={estilos.campos}>
        <label>Nombre<input required value={nombre} onChange={e => setNombre(e.target.value)} /></label>
        <label>Departamento<select required value={departamentoId} onChange={e => setDepartamentoId(Number(e.target.value))}>
          {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select></label>
        <label>Semestre de malla<input type="number" required min="1" max="14" step="1" value={semestreMalla}
          onChange={e => setSemestreMalla(Number(e.target.value))} /></label>
        <label className={estilos.casilla}><input type="checkbox" checked={esCritica} onChange={e => setEsCritica(e.target.checked)} />Asignatura crítica</label>
        <p>Se conservan las carreras y los tipos de hora asociados.</p>
        <button className="boton boton--azul" type="submit">{ocupado ? 'Guardando…' : 'Guardar asignatura'}</button>
      </fieldset>
      {error && <p role="alert" className={estilos.error}>{error}</p>}
    </form>
  </PanelAsignatura>;
}
