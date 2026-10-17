import { describe, expect, it } from "vitest";
import { createUsuarioValidation, updateUsuarioValidation } from "../src/validations/usuarios.validation.js";
import { accesoProfesorValidation, updateAccesoProfesorValidation, createProfesorValidation, updateProfesorValidation } from "../src/validations/profesores.validation.js";

const usuario = { nombre: "Ana", correo: "ana@example.cl", clave: "abcdef", rol: "profesor" };
const profesor = { nombre: "Ana", rut: "6-K", departamentoId: 1, tipo: "planta" };
const correoDeLongitud = (longitud: number) => `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(longitud - 193)}`;

describe("límites de nombre", () => {
  for (const [etiqueta, esquema, base] of [
    ["crear usuario", createUsuarioValidation, usuario],
    ["editar usuario", updateUsuarioValidation, {}],
    ["crear profesor", createProfesorValidation, profesor],
    ["editar profesor", updateProfesorValidation, {}],
  ] as const) {
    it(`${etiqueta}: acepta 100 con trim y rechaza 101 o vacío`, () => {
      expect(esquema.parse({ ...base, nombre: ` ${"a".repeat(100)} ` }).nombre).toBe("a".repeat(100));
      expect(esquema.safeParse({ ...base, nombre: "a".repeat(101) }).success).toBe(false);
      expect(esquema.safeParse({ ...base, nombre: " " }).success).toBe(false);
    });
  }
});

describe("límites de correo", () => {
  for (const [etiqueta, esquema, base] of [
    ["crear usuario", createUsuarioValidation, usuario],
    ["editar usuario", updateUsuarioValidation, {}],
    ["crear acceso", accesoProfesorValidation, { clave: "abcdef" }],
    ["editar acceso", updateAccesoProfesorValidation, {}],
  ] as const) {
    it(`${etiqueta}: acepta 254 con trim y rechaza 255`, () => {
      const correo = correoDeLongitud(254);
      expect(correo.length).toBe(254);
      expect(esquema.parse({ ...base, correo: ` ${correo} ` }).correo).toBe(correo);
      expect(esquema.safeParse({ ...base, correo: correoDeLongitud(255) }).success).toBe(false);
    });
  }
  it("creación de profesor valida el acceso opcional anidado", () => {
    expect(createProfesorValidation.safeParse(profesor).success).toBe(true);
    expect(createProfesorValidation.parse({ ...profesor, acceso: { correo: correoDeLongitud(254), clave: "abcdef" } }).acceso?.correo.length).toBe(254);
    expect(createProfesorValidation.safeParse({ ...profesor, acceso: { correo: correoDeLongitud(255), clave: "abcdef" } }).success).toBe(false);
  });
});

it("actualizaciones conservan campos opcionales y acceso exige al menos un cambio", () => {
  expect(updateUsuarioValidation.parse({})).toEqual({});
  expect(updateProfesorValidation.parse({})).toEqual({});
  expect(updateAccesoProfesorValidation.safeParse({}).success).toBe(false);
  expect(updateAccesoProfesorValidation.parse({ clave: "abcdef" })).toEqual({ clave: "abcdef" });
  expect(updateAccesoProfesorValidation.parse({ correo: " ana@example.cl " })).toEqual({ correo: "ana@example.cl" });
});

it("contraseñas backend conservan mínimo 6 sin máximo nuevo ni trim", () => {
  for (const [esquema, base] of [
    [createUsuarioValidation, usuario], [updateUsuarioValidation, {}],
    [accesoProfesorValidation, { correo: "ana@example.cl" }], [updateAccesoProfesorValidation, {}],
  ] as const) {
    for (const clave of ["abcdef", "a".repeat(73), "á".repeat(73), "😀".repeat(40), " clave "]) {
      expect(esquema.parse({ ...base, clave }).clave).toBe(clave);
    }
    expect(esquema.safeParse({ ...base, clave: "12345" }).success).toBe(false);
    expect(esquema.safeParse({ ...base, clave: "" }).success).toBe(false);
  }
  const clave = "á".repeat(73);
  expect(createProfesorValidation.parse({ ...profesor, acceso: { correo: "ana@example.cl", clave } }).acceso?.clave).toBe(clave);
});
