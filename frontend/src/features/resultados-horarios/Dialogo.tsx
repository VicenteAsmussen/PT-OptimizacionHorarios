import { useEffect, useRef, type ReactNode } from 'react';
import estilos from './ResultadosHorarios.module.css';

export default function Dialogo({ titulo, ocupado, cerrar, children }: {
  titulo: string; ocupado: boolean; cerrar: () => void; children: ReactNode;
}) {
  const referencia = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const anterior = document.activeElement;
    const dialogo = referencia.current;
    dialogo?.showModal();
    return () => {
      dialogo?.close();
      if (anterior instanceof HTMLElement && anterior.isConnected && !anterior.hasAttribute('disabled')) anterior.focus();
      else document.getElementById('titulo-resultados')?.focus();
    };
  }, []);
  return <dialog ref={referencia} className={estilos.dialogo} aria-labelledby="titulo-dialogo-resultados"
    onCancel={evento => { evento.preventDefault(); if (!ocupado) cerrar(); }}>
    <h2 id="titulo-dialogo-resultados">{titulo}</h2>
    {children}
    <button type="button" className="boton" disabled={ocupado} onClick={cerrar}>Cerrar</button>
  </dialog>;
}
