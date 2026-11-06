import { Children, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import estilos from './SuperficiesResultados.module.css';

export default function Dialogo({ titulo, ocupado, cerrar, children, tamano }: {
  titulo: string; ocupado: boolean; cerrar: () => void; children: ReactNode; tamano?: 'detalle';
}) {
  const referencia = useRef<HTMLDialogElement>(null);
  // Las acciones directas conservan sus propiedades y su orden fuera del cuerpo desplazable.
  const elementos = Children.toArray(children);
  const esAccion = (elemento: ReactNode) => isValidElement(elemento) && elemento.type === 'button';
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
  return <dialog ref={referencia} className={estilos.dialogo} data-tamano={tamano} aria-labelledby="titulo-dialogo-resultados"
    onCancel={evento => { evento.preventDefault(); if (!ocupado) cerrar(); }}>
    <header className={estilos.cabeceraDialogo}>
      <h2 id="titulo-dialogo-resultados">{titulo}</h2>
    </header>
    <div className={estilos.cuerpoDialogo} role="region" aria-labelledby="titulo-dialogo-resultados" tabIndex={0}>
      {elementos.filter(elemento => !esAccion(elemento))}
    </div>
    <footer className={estilos.pieDialogo}>
      {elementos.filter(esAccion)}
      <button type="button" className={`boton ${estilos.accionSecundaria}`} disabled={ocupado} onClick={cerrar}>Cerrar</button>
    </footer>
  </dialog>;
}
