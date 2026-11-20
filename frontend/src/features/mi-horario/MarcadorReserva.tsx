import estilos from './MiHorario.module.css';

// Señala reservas de carrera y advierte si coinciden con una clase mostrada.
export default function MarcadorReserva({ conClase }: { conClase: boolean }) {
  return <span className={estilos.reserva}>
    <strong>Reservado</strong>
    {conClase && <span>Clase en bloque reservado</span>}
  </span>;
}
