import { expect, it } from "vitest";
import { exigirBasePruebas } from "./soporte/base-pruebas.js";

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
  expect(() => exigirBasePruebas({ ...entornoValido(), ...cambio })).toThrow("dedicated horarios_test database");
});
