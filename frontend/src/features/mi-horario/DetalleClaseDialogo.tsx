import { useEffect, useRef } from 'react';
import { describirClase } from './modelo';
import { horarioSesion } from './sesiones';
import type { Bloque, ClaseHorario } from './types';
import estilos from './MiHorario.module.css';

interface Propiedades {
  clase: ClaseHorario;
  bloque: Bloque;
  bloquesSesion?: Bloque[];
  cerrar: () => void;
}

export default function DetalleClaseDialogo({ clase, bloque, bloquesSesion = [bloque], cerrar }: Propiedades) {
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
    <header className={estilos.cabeceraDialogo}>
      <h2 id="titulo-detalle-clase">Detalle de la clase</h2>
      <p>{detalle.asignatura}</p>
    </header>
    <div className={estilos.cuerpoDialogo}>
      <dl className={estilos.detalles}>
        <div><dt>Sección</dt><dd>{detalle.seccion}</dd></div>
        <div><dt>Tipo de clase</dt><dd>{detalle.tipo}</dd></div>
        <div><dt>Día</dt><dd>{bloque.dia}</dd></div>
        <div><dt>Horario</dt><dd>{horarioSesion(bloquesSesion)}{bloquesSesion.length > 1 && <span className={estilos.duracionSesion}>{bloquesSesion.length} bloques</span>}</dd></div>
        <div className={estilos.salaDetalle}><dt>Sala</dt><dd>{detalle.sala}</dd></div>
      </dl>
    </div>
    <footer className={estilos.pieDialogo}>
      <button type="button" className="boton boton--gris" onClick={cerrar}>Cerrar</button>
    </footer>
  </dialog>;
}
