import estilos from './MiHorario.module.css';

export default function MarcadorReserva({ conClase }: { conClase: boolean }) {
  return <span className={estilos.reserva}>
    <strong>Reservado</strong>
    {conClase && <span>Clase en bloque reservado</span>}
  </span>;
}
