import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: { PRUEBAS_EN_EJECUCION: "yes" },
    testTimeout: 15000,
    fileParallelism: false,
  },
});
