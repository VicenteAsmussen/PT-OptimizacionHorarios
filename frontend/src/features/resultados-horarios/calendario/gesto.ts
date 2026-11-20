interface Puntero { pointerId: number; clientX: number; clientY: number; pointerType?: string }
interface Captura { setPointerCapture: (id: number) => void; hasPointerCapture: (id: number) => boolean; releasePointerCapture: (id: number) => void }

// El gesto no cambia el destino hasta soltarlo, cancelar conserva la vista previa anterior.
// Coordina el arrastre de grupos horarios como selección previa, sin guardarlos.
export function crearGesto(acciones: {
  preparado: (identidad: string) => boolean; destino: (x: number, y: number) => number | null;
  elegir: (id: number) => void; anunciar: (texto: string) => void;
  representar: (puntero: Puntero | null) => void;
}, reloj = { programar: setTimeout.bind(globalThis), cancelar: clearTimeout.bind(globalThis) }) {
  let pendiente: { puntero: Puntero; elemento: Captura; identidad: string; activo: boolean } | null = null;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let suprimirClick = false;
  // Captura el puntero cuando el grupo todavía admite iniciar su arrastre.
  function activar(puntero: Puntero) {
    if (!pendiente || !acciones.preparado(pendiente.identidad)) { cancelar(); return; }
    if (temporizador !== null) reloj.cancelar(temporizador);
    temporizador = null;
    pendiente.activo = true;
    pendiente.elemento.setPointerCapture(puntero.pointerId);
    acciones.representar(puntero);
    acciones.anunciar('Arrastrando el grupo seleccionado. Suelta sobre el inicio del destino para previsualizar.');
  }
  // Libera el gesto y su representación sin sustituir el destino previsualizado.
  function cancelar() {
    if (temporizador !== null) reloj.cancelar(temporizador);
    temporizador = null;
    const anterior = pendiente;
    pendiente = null;
    if (anterior?.activo) {
      suprimirClick = true;
      acciones.representar(null);
      if (anterior.elemento.hasPointerCapture(anterior.puntero.pointerId)) anterior.elemento.releasePointerCapture(anterior.puntero.pointerId);
      acciones.anunciar('');
    }
  }
  return {
    // Prepara el arrastre con la identidad del grupo horario seleccionado.
    iniciar(puntero: Puntero, elemento: Captura, identidad: string) {
      cancelar(); suprimirClick = false;
      pendiente = { puntero: { pointerId: puntero.pointerId, clientX: puntero.clientX, clientY: puntero.clientY, pointerType: puntero.pointerType }, elemento, identidad, activo: false };
      temporizador = reloj.programar(() => {
        temporizador = null;
        if (pendiente) activar(pendiente.puntero);
      }, 450);
    },
    // Distingue el arrastre del desplazamiento táctil y actualiza su guía visual.
    mover(evento: Puntero & { preventDefault: () => void }) {
      if (!pendiente || evento.pointerId !== pendiente.puntero.pointerId) return;
      if (!pendiente.activo) {
        if (Math.hypot(evento.clientX - pendiente.puntero.clientX, evento.clientY - pendiente.puntero.clientY) > 8) {
          if (pendiente.puntero.pointerType === 'mouse') { evento.preventDefault(); activar(evento); }
          else cancelar();
        }
      } else {
        evento.preventDefault();
        if (!acciones.preparado(pendiente.identidad)) cancelar();
        else acciones.representar(evento);
      }
    },
    // Elige el destino admitido al soltar sin confirmar el movimiento en el servidor.
    soltar(evento: Puntero) {
      if (!pendiente || evento.pointerId !== pendiente.puntero.pointerId) return;
      const id = pendiente.activo && acciones.preparado(pendiente.identidad) ? acciones.destino(evento.clientX, evento.clientY) : null;
      cancelar();
      if (id !== null) acciones.elegir(id);
    },
    cancelar,
    // Indica si un grupo horario tiene el puntero capturado para arrastre.
    activo: () => Boolean(pendiente?.activo),
    // Evita que el clic posterior al arrastre se interprete como otra selección.
    consumirClick() { const suprimir = suprimirClick; suprimirClick = false; return suprimir; },
  };
}
