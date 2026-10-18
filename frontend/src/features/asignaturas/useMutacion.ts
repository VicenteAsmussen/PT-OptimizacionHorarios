import { useEffect, useRef, useState } from 'react';
import { notificaciones } from '../../lib/notificaciones';

export function useMutacion() {
  const bloqueo = useRef(false);
  const vigente = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    vigente.current = true;
    return () => { vigente.current = false; };
  }, []);
  async function ejecutar(guardar: () => Promise<unknown>, completar: () => void) {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(true);
    setError('');
    try {
      await guardar();
      if (vigente.current) {
        notificaciones.exito('Cambios guardados.');
        completar();
      }
    } catch (fallo) {
      if (vigente.current) {
        const mensaje = fallo instanceof Error ? fallo.message : 'No se pudo guardar. Inténtalo nuevamente.';
        setError(mensaje);
        notificaciones.error(mensaje);
      }
    } finally {
      bloqueo.current = false;
      if (vigente.current) setOcupado(false);
    }
  }
  return { ocupado, error, ejecutar };
}
