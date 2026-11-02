import { expect, it } from "vitest";
import { exigirBasePruebas, habilitarPruebasIntegracion } from "./soporte/base-pruebas.js";

const entornoValido = () => ({ NODE_ENV: "test", BASE_PRUEBAS_REINICIABLE: "yes",
  DATABASE_URL: "postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_test" });

it("permite únicamente la base y el usuario de pruebas explícitos", () => {
  expect(() => exigirBasePruebas(entornoValido())).not.toThrow();
});
it.each([
  { BASE_PRUEBAS_REINICIABLE: undefined },
  { NODE_ENV: "development" },
  { DATABASE_URL: undefined },
  { DATABASE_URL: "no-es-url" },
  { DATABASE_URL: "postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_db" },
  { DATABASE_URL: "postgres://pruebas_horarios:pruebas_horarios@localhost:5432/horarios_test" },
  { DATABASE_URL: "postgres://postgres:postgres@postgres:5432/horarios_test" },
  { DATABASE_URL: "postgres://pruebas_horarios:pruebas_horarios@postgres:5433/horarios_test" },
  { DATABASE_URL: "postgres://otro:pruebas_horarios@postgres:5432/horarios_test" },
  { DATABASE_URL: "postgres://pruebas_horarios:otra@postgres:5432/horarios_test" },
  { DATABASE_URL: `${entornoValido().DATABASE_URL}?host=postgres` },
  { DATABASE_URL: `${entornoValido().DATABASE_URL}#otro` },
])("rechaza un entorno distinto sin intentar conectarse: %j", cambio => {
  expect(() => exigirBasePruebas({ ...entornoValido(), ...cambio })).toThrow("Las pruebas requieren la base horarios_test");
});

it("omite las suites de escritura cuando no se habilitan expresamente", () => {
  expect(habilitarPruebasIntegracion({})).toBe(false);
});

it("rechaza habilitar escrituras sin el destino y la confirmación de pruebas", () => {
  expect(() => habilitarPruebasIntegracion({ RUN_ISOLATED_DATABASE_TESTS: "true" }))
    .toThrow("Las pruebas requieren la base horarios_test");
});

it("habilita las escrituras solo con las dos confirmaciones y el destino autorizado", () => {
  expect(habilitarPruebasIntegracion({ ...entornoValido(), RUN_ISOLATED_DATABASE_TESTS: "true" })).toBe(true);
});
