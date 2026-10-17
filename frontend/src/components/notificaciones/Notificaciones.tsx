import { Toaster } from "sonner";
import estilos from "./Notificaciones.module.css";

export default function Notificaciones() {
  return <Toaster theme="light" position="top-right" closeButton duration={5000}
    containerAriaLabel="Notificaciones" customAriaLabel="Notificación"
    className={estilos.contenedor} mobileOffset={16}
    toastOptions={{
      closeButtonAriaLabel: "Cerrar notificación",
      classNames: { toast: estilos.aviso, icon: estilos.icono, closeButton: estilos.cerrar },
    }} />;
}
