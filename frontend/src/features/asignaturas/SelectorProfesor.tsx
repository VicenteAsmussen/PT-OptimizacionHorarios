import { useId, useState } from 'react';
import { buscarProfesores } from './datos';
import type { ProfesorSeccion } from './types';
import estilos from './Asignaturas.module.css';

export default function SelectorProfesor({ profesores, profesorId, alSeleccionar, contexto = 'tipo de hora' }: {
  profesores: ProfesorSeccion[]; profesorId: number | null; alSeleccionar: (id: number | null) => void;
  contexto?: string;
}) {
  const [edicion, setEdicion] = useState<{ profesorId: number | null; texto: string } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const identificador = useId();
  const seleccionado = profesores.find(p => p.id === profesorId);
  const busqueda = edicion?.profesorId === profesorId ? edicion.texto : seleccionado?.nombre ?? '';
  const resultados = buscarProfesores(profesores, busqueda);
  const mostrar = abierto && profesorId === null && busqueda.trim().length > 0;
  const indiceActivo = resultados.length ? Math.min(activo, resultados.length - 1) : -1;
  function seleccionar(id: number) {
    alSeleccionar(id);
    setEdicion(null);
    setAbierto(false);
  }
  return <div className={estilos.selector}>
    <label htmlFor={`${identificador}-buscar`} className={estilos.soloLectores}>Profesor de {contexto}</label>
    <input id={`${identificador}-buscar`} type="search" role="combobox" value={busqueda} autoComplete="off"
      placeholder="Escribe nombre o RUT" aria-autocomplete="list" aria-expanded={mostrar}
      aria-controls={mostrar ? `${identificador}-resultados` : undefined}
      aria-activedescendant={mostrar && indiceActivo >= 0 ? `${identificador}-opcion-${resultados[indiceActivo].id}` : undefined}
      aria-describedby={`${identificador}-estado`} onFocus={() => setAbierto(true)} onBlur={() => setAbierto(false)}
      onChange={e => {
        setEdicion({ profesorId: null, texto: e.target.value });
        if (profesorId !== null) alSeleccionar(null);
        setAbierto(true);
        setActivo(0);
      }} onKeyDown={e => {
        if (e.key === 'Escape') { setAbierto(false); return; }
        if (!mostrar) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (resultados.length) setActivo((indiceActivo + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (indiceActivo >= 0) seleccionar(resultados[indiceActivo].id);
        }
      }} />
    <small id={`${identificador}-estado`} role="status">{seleccionado ? `${seleccionado.rut} · ${seleccionado.departamento.nombre}` : 'Sin asignar'}</small>
    {mostrar && (!resultados.length ? <p role="status">No hay profesores que coincidan.</p> :
      <ul id={`${identificador}-resultados`} className={estilos.resultados} role="listbox" aria-label={`Profesores para ${contexto}`}>
        {resultados.map((p, indice) => <li key={p.id} role="none"><button type="button" className="boton boton--gris"
          id={`${identificador}-opcion-${p.id}`} role="option" aria-selected={indice === indiceActivo} tabIndex={-1}
          onMouseDown={e => e.preventDefault()} onClick={() => seleccionar(p.id)}>
          <span>{p.nombre} — {p.rut || 'Sin RUT'}<br /><small>{p.departamento.nombre}</small></span>
        </button></li>)}
      </ul>)}
  </div>;
}
