import { describe, expect, it, vi } from "vitest";
import type { AlcanceCarrera } from "../src/utils/alcance-carrera.js";
vi.mock("../src/repositories/departamentos.repository.js", () => ({ departamentosRepository: { findAll: vi.fn() } }));
import { departamentosRepository } from "../src/repositories/departamentos.repository.js";
import { departamentosService } from "../src/services/departamentos.service.js";

describe("gestión de departamentos según la carrera autenticada", () => {
  const departamentos = [{ id: 1, nombre: "Uno" }, { id: 2, nombre: "Dos" }];
  const alcance: AlcanceCarrera = { carreraId: 7, departamentosIds: [1, 2], departamentosGestionadosIds: [2],
    asignaturasCodigos: [], profesoresIds: [], ofertasIds: [] };
  it("deriva la marca del alcance, conserva departamentos externos y no muta los datos", async () => {
    vi.mocked(departamentosRepository.findAll).mockResolvedValue(departamentos as never);
    expect(await departamentosService.getAllDepartamentos(alcance)).toEqual([
      { ...departamentos[0], esGestionado: false }, { ...departamentos[1], esGestionado: true },
    ]);
    expect(departamentosRepository.findAll).toHaveBeenCalledWith(alcance);
    expect(departamentos[0]).not.toHaveProperty("esGestionado");
  });
  it("no inventa una carrera para administración ni cambia su respuesta", async () => {
    vi.mocked(departamentosRepository.findAll).mockResolvedValue(departamentos as never);
    expect(await departamentosService.getAllDepartamentos()).toEqual(departamentos);
  });
});
