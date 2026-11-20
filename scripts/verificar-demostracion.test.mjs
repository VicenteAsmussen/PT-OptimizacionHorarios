import { test } from "node:test";
import assert from "node:assert/strict";
import { validarOpciones, validarDestino, crearEntornoDemostracion } from "./verificar-demostracion.mjs";

test("exige autorización explícita y rechaza opciones desconocidas sin efectos", () => {
  assert.throws(() => validarOpciones([]), /autorizar/);
  assert.throws(() => validarOpciones(["--autorizar-entorno-efimero", "--otra"]), /desconocida/);
  assert.deepEqual(validarOpciones(["--autorizar-entorno-efimero"]), {});
});
test("el destino no admite otra base, host, puerto ni parámetros", () => {
  const destino = "postgres://demo_tesis:clave-sintetica@127.0.0.1:55432/demo_tesis_fase2";
  assert.equal(validarDestino(destino).database, "demo_tesis_fase2");
  for (const otra of [destino.replace("127.0.0.1", "localhost"), destino.replace("55432", "5432"),
    destino.replace("demo_tesis_fase2", "desarrollo"), destino + "?host=otro", destino + "#otro",
    destino.replace("demo_tesis:", "postgres:"), destino.replace("clave-sintetica", "")]) {
    assert.throws(() => validarDestino(otra), /destino/i);
  }
});
test("no hereda configuración de aplicación ni credenciales del ambiente", () => {
  const entorno = crearEntornoDemostracion("externo", { Path: "bin", DATABASE_URL: "no-heredar",
    JWT_SECRET: "no-heredar", NODE_OPTIONS: "no-heredar", PGPASSWORD: "no-heredar", PGHOST: "no-heredar" });
  assert.equal(entorno.Path, "bin");
  for (const clave of ["DATABASE_URL", "JWT_SECRET", "NODE_OPTIONS", "PGPASSWORD", "PGHOST"]) assert.equal(entorno[clave], undefined);
  assert.equal(entorno.TEMP, "externo");
});
