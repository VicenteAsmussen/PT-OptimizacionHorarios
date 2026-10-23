import { describe, expect, it } from "vitest";
import { createOfertaValidation, updateOfertaValidation } from "../src/validations/ofertas.validation.js";

const oferta = { asignaturaCodigo: "INF100", planificacionSemestreId: 3, seccion: 1, cupos: 30 };
describe("Typed teaching assignment contract", () => {
  it("allows an incomplete section and explicit empty assignment replacement", () => {
    expect(createOfertaValidation.parse(oferta)).toEqual({ ...oferta, asignaciones: [] });
    expect(updateOfertaValidation.parse({ asignaciones: [] })).toEqual({ asignaciones: [] });
    expect(updateOfertaValidation.parse({ cupos: 20 })).toEqual({ cupos: 20 });
  });
  it("allows one teacher across types and distinct teachers within a section", () => {
    for (const profesores of [[7, 7, 7], [7, 8, 7]]) {
      const asignaciones = profesores.map((profesorId, indice) => ({ tipoHoraId: indice + 1, profesorId }));
      expect(createOfertaValidation.parse({ ...oferta, asignaciones }).asignaciones).toEqual(asignaciones);
    }
  });
  it("rejects duplicate types, malformed assignments and the obsolete singular teacher", () => {
    const asignacion = { tipoHoraId: 1, profesorId: 7 };
    expect(createOfertaValidation.safeParse({ ...oferta, asignaciones: [asignacion, asignacion] }).success).toBe(false);
    for (const invalida of [{ tipoHoraId: 0, profesorId: 7 }, { tipoHoraId: 1, profesorId: null }]) {
      expect(createOfertaValidation.safeParse({ ...oferta, asignaciones: [invalida] }).success).toBe(false);
    }
    expect(createOfertaValidation.safeParse({ ...oferta, profesorId: 7 }).success).toBe(false);
  });
});
