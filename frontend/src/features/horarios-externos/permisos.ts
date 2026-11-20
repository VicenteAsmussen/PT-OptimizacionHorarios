// Reserva el intercambio de horarios externos para secretaría.
export const puedeGestionarHorariosExternos = (rol?: string | null) => rol === 'secretaria';
