import { useEffect, useRef, type ReactNode } from 'react';
import estilos from './Asignaturas.module.css';

export default function PanelAsignatura({ titulo, ocupado, alCerrar, children }: {
  titulo: string; ocupado: boolean; alCerrar: () => void; children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const anterior = document.activeElement;
    const elemento = dialogo.current!;
    const desbordamiento = document.body.style.overflow;
    elemento.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      elemento.close();
      document.body.style.overflow = desbordamiento;
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, []);
  return <dialog ref={dialogo} className={estilos.panel} aria-labelledby="titulo-panel-asignatura"
    aria-busy={ocupado} onCancel={evento => { evento.preventDefault(); if (!ocupado) alCerrar(); }}>
    <header className={estilos.cabecera}>
      <h2 id="titulo-panel-asignatura">{titulo}</h2>
      <button type="button" className="boton boton--gris" disabled={ocupado} onClick={alCerrar} autoFocus>Cerrar</button>
    </header>
    {children}
  </dialog>;
}
