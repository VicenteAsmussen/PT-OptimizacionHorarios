import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "sonner";
import { ubicarContenedorNotificaciones } from "./contenedor";
import estilos from "./Notificaciones.module.css";

export default function Notificaciones() {
  const [contenedor] = useState(() => typeof document === "undefined" ? null : document.createElement("div"));
  useLayoutEffect(() => {
    if (contenedor) return ubicarContenedorNotificaciones(contenedor);
  }, [contenedor]);
  if (!contenedor) return null;
  return createPortal(<Toaster theme="light" position="top-right" closeButton duration={5000}
    containerAriaLabel="Notificaciones" customAriaLabel="Notificación"
    className={estilos.contenedor} mobileOffset={16}
    toastOptions={{
      closeButtonAriaLabel: "Cerrar notificación",
      classNames: { toast: estilos.aviso, icon: estilos.icono, closeButton: estilos.cerrar },
    }} />, contenedor);
}
