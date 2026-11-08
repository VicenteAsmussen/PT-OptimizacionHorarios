// El portal conserva su nodo e instancia de Sonner al entrar o salir de un modal.
export function ubicarContenedorNotificaciones(contenedor: HTMLElement, documento: Document = document) {
  let dialogos = Array.from(documento.querySelectorAll<HTMLDialogElement>('dialog:modal'));
  function ubicar() {
    dialogos = dialogos.filter(dialogo => dialogo.isConnected && dialogo.matches(':modal'));
    for (const dialogo of documento.querySelectorAll<HTMLDialogElement>('dialog:modal')) {
      if (!dialogos.includes(dialogo)) dialogos.push(dialogo);
    }
    const destino = dialogos.at(-1) ?? documento.body;
    if (contenedor.parentElement !== destino) destino.appendChild(contenedor);
  }
  const observador = new documento.defaultView!.MutationObserver(cambios => {
    for (const cambio of cambios) {
      if (cambio.type === 'attributes' && cambio.attributeName === 'open') {
        const dialogo = cambio.target as HTMLDialogElement;
        dialogos = dialogos.filter(anterior => anterior !== dialogo);
        if (dialogo.matches('dialog:modal')) dialogos.push(dialogo);
      }
    }
    ubicar();
  });
  observador.observe(documento.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  ubicar();
  return () => { observador.disconnect(); contenedor.remove(); };
}
