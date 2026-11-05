export function ordenarPeriodosPorFechaAcademica<T extends { codigo: string }>(periodos: readonly T[]): T[] {
  return [...periodos].sort((primero, segundo) => {
    const [anioPrimero, semestrePrimero] = primero.codigo.split('-').map(Number);
    const [anioSegundo, semestreSegundo] = segundo.codigo.split('-').map(Number);
    return anioSegundo - anioPrimero || semestreSegundo - semestrePrimero;
  });
}
