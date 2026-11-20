import { toast } from "sonner";

// Los avisos compartidos duran cinco segundos y permiten cierre explícito.
export const notificaciones = {
  // Confirma una operación académica mediante un aviso temporal.
  exito: (mensaje: string, id?: string | number) => toast.success(mensaje, { id, duration: 5000, closeButton: true }),
  // Comunica un fallo sin sustituir el estado de la pantalla que lo originó.
  error: (mensaje: string, id?: string | number) => toast.error(mensaje, { id, duration: 5000, closeButton: true }),
  // Advierte de resultados parciales o acciones que requieren atención.
  advertencia: (mensaje: string, id?: string | number) => toast.warning(mensaje, { id, duration: 5000, closeButton: true }),
  // Retira un aviso que dejó de corresponder al contexto visible.
  cerrar: (id: string | number) => toast.dismiss(id),
};
