import type { FocusEvent } from 'react';

// El desplazamiento nativo no siempre considera la columna fija al tabular.
export function mantenerFocoEnTabla(evento: FocusEvent<HTMLDivElement>) {
  const contenedor = evento.currentTarget;
  const objetivo = evento.target;
  if (objetivo === contenedor) return;

  const limite = contenedor.getBoundingClientRect().left + contenedor.clientLeft;
  const columnaFija = contenedor.querySelector('thead tr > :first-child');
  const izquierda = (columnaFija?.getBoundingClientRect().right ?? limite) + 6;
  const derecha = limite + contenedor.clientWidth - 6;
  const control = objetivo.getBoundingClientRect();

  if (control.right > derecha) contenedor.scrollLeft += control.right - derecha;
  else if (control.left < izquierda) contenedor.scrollLeft += control.left - izquierda;
}
