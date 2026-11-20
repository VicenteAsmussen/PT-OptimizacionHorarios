import { exigirBasePruebas } from "../../src/config/seguridad-pruebas.js";

export { exigirBasePruebas };

// Omite la integración sin autorización explícita y valida el destino antes de importar módulos con persistencia.
export function habilitarPruebasIntegracion(entorno: NodeJS.ProcessEnv) {
  if (entorno.RUN_ISOLATED_DATABASE_TESTS !== "true") return false;
  exigirBasePruebas(entorno);
  return true;
}
