import { exigirBasePruebas } from "../../src/config/seguridad-pruebas.js";

export { exigirBasePruebas };

export function habilitarPruebasIntegracion(entorno: NodeJS.ProcessEnv) {
  if (entorno.RUN_ISOLATED_DATABASE_TESTS !== "true") return false;
  exigirBasePruebas(entorno);
  return true;
}
