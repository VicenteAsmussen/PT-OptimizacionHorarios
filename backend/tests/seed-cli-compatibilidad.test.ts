import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";

it.each([
  {
    argumento: "--invalid",
    mensaje: "Uso: pnpm run db:seed [--reemplazar-academico]",
    salida: "",
    marcos: ["seed.ts:13:11", "seed.ts:37:1"],
  },
  {
    argumento: "--reemplazar-academico",
    mensaje: "El reemplazo académico solo permite la base local horarios_db en desarrollo",
    salida: "Conectando a la base de datos para ejecutar el seed...\nReemplazando asignaturas, profesores y sus datos dependientes en la base local...\n",
    marcos: ["reemplazo.ts:12:11", "seed.ts:22:13", "seed.ts:37:1"],
  },
])("preserves rejected CLI output: $argumento", ({ argumento, mensaje, salida, marcos }) => {
  const resultado = spawnSync(process.execPath, [
    "node_modules/tsx/dist/cli.mjs", "src/db/seed.ts", argumento,
  ], {
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/verificacion_seed_cli", DOTENV_CONFIG_QUIET: "true" },
  });
  expect(resultado.status).toBe(1);
  expect(resultado.stdout.replace(/\r\n/g, "\n")).toBe(salida);
  const lineas = resultado.stderr.replace(/\r\n/g, "\n").split("\n");
  expect(lineas[0]).toBe(`Error durante el seed: Error: ${mensaje}`);
  for (const [indice, marco] of marcos.entries()) expect(lineas[indice + 1]).toContain(marco);
});
