import { useEffect, useState } from 'react';

// Detecta si la tabla necesita una indicación de desplazamiento horizontal.
export function useDesbordamientoTabla() {
  const [contenedor, referencia] = useState<HTMLDivElement | null>(null);
  const [desborda, setDesborda] = useState(false);

  useEffect(() => {
    if (!contenedor) {
      setDesborda(false);
      return;
    }
    // Reevalúa si las columnas exceden el espacio disponible para consultarlas.
    const medir = () => setDesborda(contenedor.scrollWidth > contenedor.clientWidth);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(contenedor);
    if (contenedor.firstElementChild) observador.observe(contenedor.firstElementChild);
    return () => observador.disconnect();
  }, [contenedor]);

  return { referencia, desborda };
}
