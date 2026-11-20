import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { comprobaciones, crearEntorno, seleccionarComprobacion } from "./verificar-local.mjs";

test("separa transporte de funcionalidades y no admite selectores arbitrarios", () => {
  assert.deepEqual(comprobaciones.transporte.archivos, ["tests/api.test.mjs"]);
  assert.equal(comprobaciones.frontend.archivos.length, 40);
  assert.ok(comprobaciones.frontend.archivos.every(archivo => archivo.startsWith("src/")));
  assert.ok(!comprobaciones.frontend.archivos.some(archivo => /pulido-interfaz|notificaciones\/navegador/.test(archivo)));
  assert.throws(() => seleccionarComprobacion("seed"), /Comprobación desconocida/);
  assert.throws(() => seleccionarComprobacion(undefined), /Comprobación desconocida/);
});

test("el backend local usa una lista positiva sin integración, carga inicial de datos ni ofertas con base real", () => {
  const archivos = comprobaciones.backend.archivos;
  assert.ok(archivos.length > 0);
  assert.equal(new Set(archivos).size, archivos.length);
  assert.ok(archivos.every(archivo => archivo.endsWith(".test.ts") && !/[?*]/.test(archivo)));
  assert.ok(!archivos.some(archivo => /integracion\/|seed\/|^tests\/ofertas\.test|^tests\/health\.test/.test(archivo)));
});

test("el entorno hijo no hereda secretos, opciones Node ni habilitación de integración", () => {
  // Los valores señuelo permiten detectar herencia accidental sin consultar configuración real.
  const entorno = crearEntorno("temporal-externo", {
    PATH: "herramientas", SystemRoot: "sistema", DATABASE_URL: "no-copiar", JWT_SECRET: "no-copiar",
    NODE_OPTIONS: "no-copiar", RUN_ISOLATED_DATABASE_TESTS: "true", CAPTURAS_INTERFAZ: "no-copiar",
  });
  assert.equal(entorno.PATH, "herramientas");
  assert.equal(entorno.SystemRoot, "sistema");
  for (const clave of ["DATABASE_URL", "JWT_SECRET", "NODE_OPTIONS", "CAPTURAS_INTERFAZ"]) {
    assert.equal(entorno[clave], undefined);
  }
  assert.equal(entorno.RUN_ISOLATED_DATABASE_TESTS, "false");
  assert.equal(entorno.TMPDIR, "temporal-externo");
  assert.equal(entorno.TEMP, "temporal-externo");
  assert.equal(entorno.TMP, "temporal-externo");
});

test("preserva los comandos habituales sin convertirlos en una certificación completa", () => {
  const frontend = JSON.parse(readFileSync(new URL("../frontend/package.json", import.meta.url), "utf8"));
  const backend = JSON.parse(readFileSync(new URL("../backend/package.json", import.meta.url), "utf8"));
  assert.equal(frontend.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(backend.scripts.test, "vitest run");
});

test("la interfaz pública lista sin ejecutar y rechaza entradas ajenas con salida no cero", () => {
  // Solo se invocan el listado y rechazos del CLI, nunca los grupos que ejecutan herramientas.
  const script = fileURLToPath(new URL("./verificar-local.mjs", import.meta.url));
  const listado = spawnSync(process.execPath, [script, "--listar"], { encoding: "utf8" });
  assert.equal(listado.status, 0);
  assert.equal(listado.stderr, "");
  assert.match(listado.stdout, /transporte: 1 archivos explícitos/);
  assert.match(listado.stdout, /frontend: 40 archivos explícitos/);
  assert.match(listado.stdout, /backend: 18 archivos explícitos/);
  for (const argumentos of [[], ["seed"], ["frontend", "--otro-archivo"], ["__proto__"]]) {
    const rechazo = spawnSync(process.execPath, [script, ...argumentos], { encoding: "utf8" });
    assert.equal(rechazo.status, 1);
    assert.equal(rechazo.stdout, "");
    assert.match(rechazo.stderr, /Uso:|Comprobación desconocida/);
  }
});
