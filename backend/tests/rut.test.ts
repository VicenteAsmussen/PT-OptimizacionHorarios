import { describe, expect, it } from "vitest";
import { normalizarRut } from "../src/utils/rut.js";

describe("RUT chileno", () => {
  it.each(["12.345.678-5", "12345678-5", "123456785", " 12.345.678-5 "])("normaliza %s", (rut) => {
    expect(normalizarRut(rut)).toBe("12345678-5");
  });

  it.each(["6.000.000-k", "6000000K", "06.000.000-K", "06000000-k"])("valida K y ceros iniciales: %s", (rut) => {
    expect(normalizarRut(rut)).toBe("6000000-K");
  });

  it.each([
    ["1-9", "1-9"], ["19", "1-9"], ["00000001-9", "1-9"],
    ["00.000.001-9", "1-9"], ["12-4", "12-4"], ["123-6", "123-6"],
    ["1.234-3", "1234-3"], ["01.234-3", "1234-3"], ["12.345-5", "12345-5"],
    ["123456-0", "123456-0"], ["123.456-0", "123456-0"],
    ["0123456-0", "123456-0"], ["0.123.456-0", "123456-0"],
  ])("acepta cuerpos no nulos de 1–8 dígitos: %s", (entrada, esperado) => {
    expect(normalizarRut(entrada)).toBe(esperado);
  });

  it("valida DV cero", () => {
    expect(normalizarRut("10.000.004-0")).toBe("10000004-0");
  });

  it.each([undefined, null, 123456785, "", " ", "0-0", "00.000.000-0", "12345678-9", "12345678-K",
    "123456789-2", "000000001-9", "00000000-0", "00", "1", "1-0", "123456-1",
    "1.23-6", "000.000.001-9", "1234.56-0", "123.456.-0", ".123.456-0", "abc12345678-5", "12x345678-5", "12.34.5678-5", "12345678--5",
    "12 345 678-5", "12345678-5 basura", "12345678-5\nextra"])("rechaza %s sin rescatar basura", (rut) => {
    expect(normalizarRut(rut)).toBeNull();
  });
});
