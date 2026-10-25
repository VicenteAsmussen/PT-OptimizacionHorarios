import { useEffect, useRef } from 'react';
import { describirClase } from './modelo';
import type { Bloque, ClaseHorario } from './types';
import estilos from './MiHorario.module.css';

interface Propiedades {
  clase: ClaseHorario;
  bloque: Bloque;
  cerrar: () => void;
}

export default function DetalleClaseDialogo({ clase, bloque, cerrar }: Propiedades) {
  const referencia = useRef<HTMLDialogElement>(null);
  const detalle = describirClase(clase);

  useEffect(() => {
    const dialogo = referencia.current;
    if (!dialogo) return;
    const focoAnterior = document.activeElement;
    dialogo.showModal();
    return () => {
      dialogo.close();
      if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) focoAnterior.focus();
    };
  }, []);

  return <dialog ref={referencia} className={estilos.dialogo} aria-labelledby="titulo-detalle-clase"
    onCancel={evento => { evento.preventDefault(); cerrar(); }}>
    <h2 id="titulo-detalle-clase">Detalle de la clase</h2>
    <dl className={estilos.detalles}>
      <div><dt>Asignatura</dt><dd>{detalle.asignatura}</dd></div>
      <div><dt>Sección</dt><dd>{detalle.seccion}</dd></div>
      <div><dt>Tipo de clase</dt><dd>{detalle.tipo}</dd></div>
      <div><dt>Día</dt><dd>{bloque.dia}</dd></div>
      <div><dt>Horario</dt><dd>{bloque.horaInicio.slice(0, 5)}–{bloque.horaTermino.slice(0, 5)}</dd></div>
      <div><dt>Sala</dt><dd>{detalle.sala}</dd></div>
    </dl>
    <button type="button" className="boton boton--gris" onClick={cerrar}>Cerrar</button>
  </dialog>;
}
