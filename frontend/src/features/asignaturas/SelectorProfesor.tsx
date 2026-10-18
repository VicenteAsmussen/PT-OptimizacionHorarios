import { useState } from 'react';
import { buscarProfesores } from './datos';
import type { ProfesorSeccion } from './types';
import estilos from './Asignaturas.module.css';

export default function SelectorProfesor({ profesores, profesorId, alSeleccionar }: {
  profesores: ProfesorSeccion[]; profesorId: number | null; alSeleccionar: (id: number | null) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const seleccionado = profesores.find(p => p.id === profesorId);
  const resultados = buscarProfesores(profesores, busqueda);
  return <div className={estilos.selector}>
    <label htmlFor="buscar-profesor-seccion">Buscar profesor por nombre o RUT</label>
    <input id="buscar-profesor-seccion" type="search" value={busqueda} autoComplete="off"
      aria-describedby="ayuda-seleccion-profesor" onChange={e => {
        setBusqueda(e.target.value);
        alSeleccionar(null);
      }} />
    <p id="ayuda-seleccion-profesor">Selecciona un resultado; escribir no asigna un profesor. Cambiar la búsqueda borra la selección anterior.</p>
    <p role="status">{seleccionado ? <>Profesor seleccionado: <strong>{seleccionado.nombre} — {seleccionado.rut}</strong></>
      : 'Sin profesor seleccionado (obligatorio).'}</p>
    {!seleccionado && <>
      <p>{resultados.length} profesores encontrados</p>
      {!resultados.length ? <p>No hay profesores que coincidan.</p> : <ul className={estilos.resultados} aria-label="Resultados de profesores">
        {resultados.map(p => <li key={p.id}><button type="button" className="boton boton--gris"
          onClick={() => alSeleccionar(p.id)}>
          <span>{p.nombre} — {p.rut || 'Sin RUT'}<br /><small>{p.departamento.nombre}</small></span>
        </button></li>)}
      </ul>}
    </>}
    {seleccionado && <button className="boton boton--gris" type="button" onClick={() => alSeleccionar(null)}>Cambiar profesor</button>}
  </div>;
}
