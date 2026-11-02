export function exigirBasePruebas(entorno: NodeJS.ProcessEnv) {
  const destino = "postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_test";
  if (entorno.BASE_PRUEBAS_REINICIABLE !== "yes" || entorno.NODE_ENV !== "test" || entorno.DATABASE_URL !== destino) {
    throw new Error("Las pruebas requieren la base horarios_test, su usuario restringido y la autorización explícita.");
  }
}

export function protegerConexionEnPruebas(entorno: NodeJS.ProcessEnv) {
  const enPruebas = entorno.NODE_ENV === "test"
    || entorno.PRUEBAS_EN_EJECUCION === "yes"
    || entorno.VITEST === "true"
    || entorno.VITEST_WORKER_ID !== undefined;

  if (enPruebas) exigirBasePruebas(entorno);
}
