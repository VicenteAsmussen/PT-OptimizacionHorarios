import { useEffect, useState } from 'react';

export function useDesbordamientoTabla() {
  const [contenedor, referencia] = useState<HTMLDivElement | null>(null);
  const [desborda, setDesborda] = useState(false);

  useEffect(() => {
    if (!contenedor) {
      setDesborda(false);
      return;
    }
    const medir = () => setDesborda(contenedor.scrollWidth > contenedor.clientWidth);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(contenedor);
    if (contenedor.firstElementChild) observador.observe(contenedor.firstElementChild);
    return () => observador.disconnect();
  }, [contenedor]);

  return { referencia, desborda };
}
