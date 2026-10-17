import { toast } from "sonner";

// Política compartida: los fallos requieren cierre explícito; los éxitos son temporales.
export const notificaciones = {
  exito: (mensaje: string, id?: string | number) => toast.success(mensaje, { id, duration: 5000, closeButton: true }),
  error: (mensaje: string, id?: string | number) => toast.error(mensaje, { id, duration: Infinity, closeButton: true }),
  advertencia: (mensaje: string, id?: string | number) => toast.warning(mensaje, { id, duration: Infinity, closeButton: true }),
  cerrar: (id: string | number) => toast.dismiss(id),
};
