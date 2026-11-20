import { useEffect, useRef, useState } from 'react';
import { notificaciones } from '../../lib/notificaciones';

// Coordina validación, bloqueo y avisos de las escrituras de asignaturas y secciones.
export function useMutacion() {
  const bloqueo = useRef(false);
  const vigente = useRef(false);
  const aviso = useRef<{ id: string | number; confirmado: boolean } | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    vigente.current = true;
    return () => {
      vigente.current = false;
      // Guardar puede cerrar el panel, la confirmación debe completar su duración.
      if (!aviso.current?.confirmado) cerrarAviso();
    };
  }, []);
  // Retira el aviso asociado a la última escritura del panel.
  function cerrarAviso() {
    if (aviso.current !== undefined) notificaciones.cerrar(aviso.current.id);
    aviso.current = undefined;
  }
  // Descarta errores previos al corregir los datos o iniciar otra escritura.
  function limpiarError() {
    setError('');
    if (aviso.current && !aviso.current.confirmado) cerrarAviso();
  }
  // Ejecuta una escritura validada y separa su confirmación de la actualización visual.
  async function ejecutar(guardar: () => Promise<unknown>, completar: () => void, validar?: () => void) {
    if (!vigente.current || bloqueo.current) return;
    cerrarAviso();
    limpiarError();
    try {
      validar?.();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'Revisa los datos del formulario.');
      return;
    }
    bloqueo.current = true;
    setOcupado(true);
    try {
      await guardar();
    } catch (fallo) {
      if (vigente.current) {
        const mensaje = fallo instanceof Error ? fallo.message : 'No se pudo guardar. Inténtalo nuevamente.';
        aviso.current = { id: notificaciones.error(mensaje), confirmado: false };
      }
      return;
    } finally {
      bloqueo.current = false;
      if (vigente.current) setOcupado(false);
    }
    if (vigente.current) {
      aviso.current = { id: notificaciones.exito('Cambios guardados.'), confirmado: true };
      // Un fallo al actualizar la vista no convierte el guardado confirmado en error.
      completar();
    }
  }
  return { ocupado, error, ejecutar, limpiarError };
}
