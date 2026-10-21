export function exigirBasePruebas(entorno: NodeJS.ProcessEnv) {
  const destino = "postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_test";
  if (entorno.BASE_PRUEBAS_REINICIABLE !== "yes" || entorno.NODE_ENV !== "test" || entorno.DATABASE_URL !== destino) {
    throw new Error("Integration checks require the dedicated horarios_test database and test role.");
  }
}
