// Permite consultar resultados a secretaría y administración.
export const puedeGestionarResultados = (rol?: string | null) => rol === 'secretaria' || rol === 'admin';
// Reserva las escrituras sobre resultados horarios al rol secretaría.
export const puedeOperarResultados = (rol?: string | null) => rol === 'secretaria';
