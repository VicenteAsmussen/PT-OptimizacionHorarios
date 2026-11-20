import { describe, expect, it } from "vitest";
import { createOfertaValidation, updateOfertaValidation } from "../src/validations/ofertas.validation.js";

const oferta = { asignaturaCodigo: "INF100", planificacionSemestreId: 3, seccion: 1, cupos: 30 };
describe("Contrato de asignación docente por tipo de hora", () => {
  it("permite una sección incompleta y reemplazar asignaciones por una selección vacía explícita", () => {
    expect(createOfertaValidation.parse(oferta)).toEqual({ ...oferta, asignaciones: [] });
    expect(updateOfertaValidation.parse({ asignaciones: [] })).toEqual({ asignaciones: [] });
    expect(updateOfertaValidation.parse({ cupos: 20 })).toEqual({ cupos: 20 });
  });
  it("permite un profesor en varios tipos de hora y profesores distintos en una sección", () => {
    for (const profesores of [[7, 7, 7], [7, 8, 7]]) {
      const asignaciones = profesores.map((profesorId, indice) => ({ tipoHoraId: indice + 1, profesorId }));
      expect(createOfertaValidation.parse({ ...oferta, asignaciones }).asignaciones).toEqual(asignaciones);
    }
  });
  it("rechaza tipos duplicados, asignaciones malformadas y el campo obsoleto de profesor único", () => {
    const asignacion = { tipoHoraId: 1, profesorId: 7 };
    expect(createOfertaValidation.safeParse({ ...oferta, asignaciones: [asignacion, asignacion] }).success).toBe(false);
    for (const invalida of [{ tipoHoraId: 0, profesorId: 7 }, { tipoHoraId: 1, profesorId: null }]) {
      expect(createOfertaValidation.safeParse({ ...oferta, asignaciones: [invalida] }).success).toBe(false);
    }
    expect(createOfertaValidation.safeParse({ ...oferta, profesorId: 7 }).success).toBe(false);
  });
});
