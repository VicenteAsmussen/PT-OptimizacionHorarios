import { isAbsolute, join } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import configuracion from "./vitest.config.js";
// @ts-expect-error El inventario compartido pertenece al arnés Node, no a src.
import { comprobaciones } from "../scripts/verificar-local.mjs";

const temporal = process.env.VERIFICACION_TEMPORAL;
if (!temporal || !isAbsolute(temporal)) throw new Error("Usa pnpm test:local para asignar temporales externos.");

export default mergeConfig(configuracion, defineConfig({
  envFile: false,
  cacheDir: join(temporal, "vite"),
  test: {
    include: comprobaciones.backend.archivos,
    fsModuleCachePath: join(temporal, "vitest"),
    attachmentsDir: join(temporal, "adjuntos"),
  },
}));
