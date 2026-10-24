import { beforeEach, describe, expect, it, vi } from "vitest";
const repositorio = vi.hoisted(() => ({
  checkProfesorExists: vi.fn(async () => true),
  findExistingBloquesIds: vi.fn(async (ids: number[]) => ids),
  syncDisponibilidad: vi.fn(async () => []),
  deleteByProfesorAndPlanificacion: vi.fn(async () => 2),
  findAll: vi.fn(async () => []),
  checkBloqueExists: vi.fn(async () => true),
  findSpecific: vi.fn(async () => undefined),
  create: vi.fn(async () => ({ id: 50 })),
  findById: vi.fn(async () => ({ id: 50, profesorId: 7, planificacionSemestreId: 10, bloqueId: 2 })),
  delete: vi.fn(async () => true),
}));
vi.mock("../src/repositories/disponibilidad.repository.js", () => ({ disponibilidadRepository: repositorio }));
vi.mock("../src/repositories/planificaciones-semestres.repository.js", () => ({ planificacionesSemestresRepository: {} }));
vi.mock("../src/services/planificaciones-semestres.service.js", () => ({
  planificacionesSemestresService: { getById: async () => ({ actual: true, estadoPlanificacion: "preparacion" }) },
}));
vi.mock("../src/config/db.js", () => ({ db: {} }));
import { disponibilidadService } from "../src/services/disponibilidad.service.js";
beforeEach(() => vi.clearAllMocks());
describe("Compatibilidad administrativa de disponibilidad", () => {
  it("admin conserva sincronización vacía", async () => {
    expect(await disponibilidadService.syncGrid({ profesorId: 7, planificacionSemestreId: 10, bloquesIds: [] }, undefined, { id: 1, rol: "admin" })).toEqual([]);
    expect(repositorio.syncDisponibilidad).toHaveBeenCalledWith(7, 10, []);
  });
  it("admin conserva limpieza de planificación", async () => {
    expect(await disponibilidadService.clearGrid(7, 10, undefined, { id: 1, rol: "admin" })).toBe(2);
    expect(repositorio.deleteByProfesorAndPlanificacion).toHaveBeenCalledWith(7, 10);
  });
  it("admin conserva consulta sin filtro", async () => {
    expect(await disponibilidadService.getDisponibilidad(undefined, undefined, { id: 1, rol: "admin" })).toEqual([]);
    expect(repositorio.findAll).toHaveBeenCalledWith(undefined, undefined);
  });
  it("admin conserva creación de un bloque individual", async () => {
    expect(await disponibilidadService.createSingle({ profesorId: 7, planificacionSemestreId: 10, bloqueId: 2 }, undefined, { id: 1, rol: "admin" })).toEqual({ id: 50, profesorId: 7, planificacionSemestreId: 10, bloqueId: 2 });
    expect(repositorio.create).toHaveBeenCalledWith({ profesorId: 7, planificacionSemestreId: 10, bloqueId: 2 });
  });
  it("admin conserva eliminación de un bloque individual", async () => {
    await disponibilidadService.deleteSingle(50, undefined, { id: 1, rol: "admin" });
    expect(repositorio.delete).toHaveBeenCalledWith(50);
  });
});
