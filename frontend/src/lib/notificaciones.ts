import { toast } from "sonner";

// Shared notices expire after five seconds and remain explicitly dismissible.
export const notificaciones = {
  exito: (mensaje: string, id?: string | number) => toast.success(mensaje, { id, duration: 5000, closeButton: true }),
  error: (mensaje: string, id?: string | number) => toast.error(mensaje, { id, duration: 5000, closeButton: true }),
  advertencia: (mensaje: string, id?: string | number) => toast.warning(mensaje, { id, duration: 5000, closeButton: true }),
  cerrar: (id: string | number) => toast.dismiss(id),
};
