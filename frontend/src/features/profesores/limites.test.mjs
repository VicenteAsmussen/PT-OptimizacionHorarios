import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepararDatosProfesor } from "./rut.ts";
import * as formularios from "./formularios.ts";

const profesor = { nombre: "Ana", rut: "6-K", departamentoId: 1, tipo: "planta" };
const correoDeLongitud = (longitud) => `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(longitud - 193)}`;

test("nombre acepta 100 y rechaza 101 después de trim sin mutar entrada", () => {
  const entrada = { ...profesor, nombre: ` ${"a".repeat(100)} ` };
  assert.equal(prepararDatosProfesor(entrada).nombre.length, 100);
  assert.equal(entrada.nombre.length, 102);
  assert.throws(() => prepararDatosProfesor({ ...profesor, nombre: "a".repeat(101) }), /100/);
});

test("edición valida correo de 254/255 aun cuando coincide con el anterior", () => {
  const correo = correoDeLongitud(254);
  assert.equal(correo.length, 254);
  assert.deepEqual(formularios.prepararCambiosAcceso(` ${correo} `, "", "antes@example.cl"), { correo });
  assert.equal(formularios.prepararCambiosAcceso(correo, "", correo), null);
  const largo = correoDeLongitud(255);
  assert.throws(() => formularios.prepararCambiosAcceso(largo, "", largo), /254/);
});

for (const [etiqueta, clave72, clave73] of [
  ["ASCII", "a".repeat(72), "a".repeat(73)],
  ["acentos", "á".repeat(36), `${"á".repeat(36)}a`],
  ["emoji", "😀".repeat(18), `${"😀".repeat(18)}a`],
]) {
  test(`edición valida bytes UTF-8: ${etiqueta} 72/73`, () => {
    assert.deepEqual(formularios.prepararCambiosAcceso("", clave72, ""), { clave: clave72 });
    assert.throws(() => formularios.prepararCambiosAcceso("", clave73, ""), /72 bytes/);
  });
}

test("nuevo acceso compartido por creación inicial y separada valida sin alterar contraseña", () => {
  assert.equal(typeof formularios.prepararNuevoAcceso, "function");
  const correo = correoDeLongitud(254);
  for (const clave of ["a".repeat(72), "á".repeat(36), "😀".repeat(18), " clave ", "corta"]) {
    assert.deepEqual(formularios.prepararNuevoAcceso(` ${correo} `, clave), { correo, clave });
  }
  assert.throws(() => formularios.prepararNuevoAcceso(correoDeLongitud(255), "abcdef"), /254/);
  for (const clave of ["a".repeat(73), "á".repeat(36) + "a", "😀".repeat(18) + "a"]) {
    assert.throws(() => formularios.prepararNuevoAcceso(correo, clave), /72 bytes/);
  }
  assert.deepEqual(formularios.prepararCambiosAcceso(" nuevo@example.cl ", "", "antes@example.cl"), { correo: "nuevo@example.cl" });
  assert.equal(formularios.prepararCambiosAcceso("", "", "antes@example.cl"), null);
});

test("formularios conectan límites nativos, ayuda accesible y helpers antes de API", async () => {
  for (const archivo of ["FormularioProfesor.tsx", "AccionesProfesor.tsx"]) {
    const fuente = await readFile(new URL(`./${archivo}`, import.meta.url), "utf8");
    const correo = fuente.match(/<input[^>]*type="email"[\s\S]*?\/>/)?.[0];
    const clave = fuente.match(/<input[^>]*type="password"[\s\S]*?\/>/)?.[0];
    assert.match(correo, /maxLength=\{254\}/);
    assert.match(clave, /maxLength=\{72\}/);
    assert.match(clave, /aria-describedby="[^"]+"/);
    assert.match(fuente, /72 bytes/);
    assert.match(fuente, /más de un byte/);
    assert.match(fuente, /prepararNuevoAcceso\(correo, clave\)/);
    if (archivo === "FormularioProfesor.tsx") {
      assert.match(fuente.match(/<input id="profesor-nombre"[\s\S]*?\/>/)?.[0], /maxLength=\{100\}/);
    } else assert.match(fuente, /prepararCambiosAcceso\(correo, clave,/);
  }
});
