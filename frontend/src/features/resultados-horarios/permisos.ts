export const puedeGestionarResultados = (rol?: string | null) => rol === 'secretaria' || rol === 'admin';
export const puedeOperarResultados = (rol?: string | null) => rol === 'secretaria';
