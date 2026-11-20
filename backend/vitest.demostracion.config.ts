import { isAbsolute, join } from "node:path";
import { defineConfig } from "vitest/config";

const temporal = process.env.VERIFICACION_TEMPORAL;
if (!temporal || !isAbsolute(temporal) || process.env.DEMOSTRACION_AUTORIZADA !== "cluster-propio-sintetico") {
  throw new Error("Use scripts/verificar-demostracion.mjs con autorización explícita.");
}
export default defineConfig({
  envFile: false,
  cacheDir: join(temporal, "vite"),
  test: {
    environment: "node", include: ["tests/demostracion/escenario.test.ts"],
    fileParallelism: false, maxWorkers: 1, testTimeout: 30000, hookTimeout: 30000,
    fsModuleCachePath: join(temporal, "vitest"), attachmentsDir: join(temporal, "adjuntos"),
  },
});
