import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { PlanificacionSemestre } from '../asignaturas/types';
import { estadosPeriodo } from './modelo';
import estilos from './AdministracionPeriodos.module.css';

interface Propiedades {
  periodos: PlanificacionSemestre[];
  valor: string;
  deshabilitado: boolean;
  alSeleccionar: (valor: string) => void;
}

export default function SelectorPeriodo({ periodos, valor, deshabilitado, alSeleccionar }: Propiedades) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(valor);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const habilitado = useRef(!deshabilitado);
  habilitado.current = !deshabilitado;
  const valores = ['', ...periodos.map(periodo => String(periodo.id))];
  const indiceActivo = Math.max(0, valores.indexOf(activo));
  const expandido = abierto && !deshabilitado;
  const seleccionado = periodos.find(periodo => String(periodo.id) === valor);
  const opcionId = (indice: number) => `${id}-opcion-${indice}`;

  useEffect(() => {
    if (deshabilitado) setAbierto(false);
  }, [deshabilitado]);
  useEffect(() => {
    if (!expandido || typeof document === 'undefined') return;
    function cerrarFuera(evento: PointerEvent) {
      if (evento.target && !contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    document.addEventListener('pointerdown', cerrarFuera);
    return () => document.removeEventListener('pointerdown', cerrarFuera);
  }, [expandido]);
  useEffect(() => {
    if (expandido) lista.current?.children[indiceActivo]?.scrollIntoView?.({ block: 'nearest' });
  }, [expandido, indiceActivo]);

  function abrir() {
    if (!habilitado.current) return;
    setActivo(valor); setAbierto(true);
  }
  function elegir(opcion: string) {
    if (!habilitado.current || !valores.includes(opcion)) return;
    alSeleccionar(opcion); setAbierto(false); boton.current?.focus();
  }
  function navegar(evento: KeyboardEvent<HTMLButtonElement>) {
    if (!habilitado.current) return;
    const tecla = evento.key;
    if (tecla === 'Tab') { setAbierto(false); return; }
    if (tecla === 'Escape') {
      if (expandido) { evento.preventDefault(); setAbierto(false); boton.current?.focus(); }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(tecla)) return;
    evento.preventDefault();
    if (tecla === 'Enter' || tecla === ' ') {
      if (expandido) elegir(valores[indiceActivo]); else abrir();
      return;
    }
    const indice = tecla === 'Home' ? 0 : tecla === 'End' ? valores.length - 1
      : !expandido ? Math.max(0, valores.indexOf(valor))
      : Math.max(0, Math.min(valores.length - 1, indiceActivo + (tecla === 'ArrowDown' ? 1 : -1)));
    setActivo(valores[indice]); setAbierto(true);
  }
  function etiqueta(periodo: PlanificacionSemestre) {
    return <>{periodo.codigo}<span className={estilos.estadoPeriodo}>{estadosPeriodo[periodo.estadoPlanificacion]}</span>
      {periodo.actual && <span className={estilos.distintivo}>Actual</span>}</>;
  }
  return <div ref={contenedor} className={estilos.selectorPeriodo} onBlur={evento => {
    if (!evento.currentTarget.contains(evento.relatedTarget)) setAbierto(false);
  }}>
    <label id={`${id}-etiqueta`} htmlFor={`${id}-boton`}>Período</label>
    <button ref={boton} id={`${id}-boton`} type="button" role="combobox" aria-haspopup="listbox"
      aria-labelledby={`${id}-etiqueta`} aria-expanded={expandido} aria-controls={expandido ? `${id}-lista` : undefined}
      aria-activedescendant={expandido ? opcionId(indiceActivo) : undefined} disabled={deshabilitado}
      className={estilos.botonPeriodo} onKeyDown={navegar} onClick={() => { if (expandido) setAbierto(false); else abrir(); }}>
      {seleccionado ? etiqueta(seleccionado) : 'Selecciona un período'}
      <span aria-hidden="true">▾</span>
    </button>
    {expandido && <ul ref={lista} id={`${id}-lista`} role="listbox" aria-labelledby={`${id}-etiqueta`} className={estilos.listaPeriodos}>
      {valores.map((opcion, indice) => <li key={opcion} id={opcionId(indice)} role="option" aria-selected={valor === opcion}
        className={indice === indiceActivo ? estilos.opcionActiva : undefined}
        onMouseDown={evento => evento.preventDefault()} onClick={() => elegir(opcion)}>
        {indice === 0 ? 'Selecciona un período' : etiqueta(periodos[indice - 1])}
      </li>)}
    </ul>}
  </div>;
}
