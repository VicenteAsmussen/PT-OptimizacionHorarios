import { describe, expect, it } from "vitest";
import { inicioOptimizacion } from "../../src/validations/optimizacion.validation.js";
import { exigirInicioOptimizacion, resolverIdempotencia } from "../../src/utils/optimizacion-ejecuciones.js";

describe("admisión de ejecuciones", () => {
  it("exige preparación actual y ausencia de horarios gestionados", () => {
    expect(() => exigirInicioOptimizacion({ actual: true, estadoPlanificacion: "preparacion" }, 0)).not.toThrow();
    for (const [actual, estado, horarios] of [[false, "preparacion", 0], [true, "propuesta", 0], [true, "publicado", 0], [true, "preparacion", 1]] as const) {
      expect(() => exigirInicioOptimizacion({ actual, estadoPlanificacion: estado }, horarios)).toThrow();
    }
  });
  it("repite solamente la misma clave con los mismos parámetros", () => {
    const previa = { claveIdempotencia: "solicitud-1", revisionSolicitud: "abc" };
    expect(resolverIdempotencia(previa, "solicitud-1", "abc")).toBe(true);
    expect(resolverIdempotencia(undefined, "solicitud-1", "abc")).toBe(false);
    expect(() => resolverIdempotencia(previa, "solicitud-1", "def")).toThrow(/parámetros/);
  });
  it("no acepta recursos negativos, fraccionarios o sin procedencia", () => {
    const solicitud = { claveIdempotencia: "solicitud-123", recursos: [{ id: "lab", edificio: "Departamento", tipo: "Laboratorio", capacidad: 60, cantidad: 6, fuente: "Declaración departamental" }] };
    expect(inicioOptimizacion.safeParse(solicitud).success).toBe(true);
    for (const cantidad of [-1, 1.5]) expect(inicioOptimizacion.safeParse({ ...solicitud, recursos: [{ ...solicitud.recursos[0], cantidad }] }).success).toBe(false);
    expect(inicioOptimizacion.safeParse({ ...solicitud, recursos: [{ ...solicitud.recursos[0], fuente: "" }] }).success).toBe(false);
    expect(inicioOptimizacion.safeParse({ ...solicitud, aplicar: true }).success).toBe(false);
  });
});
