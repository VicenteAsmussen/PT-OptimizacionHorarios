import { describe, expect, it, vi } from "vitest";
import { createAsignaturaValidation, updateAsignaturaValidation } from "../src/validations/asignaturas.validation.js";
import { datosAsignaturas } from "../src/db/seeds/data/academico.js";

vi.mock("../src/repositories/asignaturas.repository.js", () => ({ asignaturasRepository: {
  findByCodigo: vi.fn(), create: vi.fn(),
} }));
vi.mock("../src/repositories/departamentos.repository.js", () => ({ departamentosRepository: { findById: vi.fn(async () => ({ id: 1 })) } }));
import { asignaturasRepository } from "../src/repositories/asignaturas.repository.js";
import { asignaturasService } from "../src/services/asignaturas.service.js";

const entrada = { codigo: "CURSO", nombre: "Course", departamentoId: 1, semestreMalla: 1 };
describe("Subject room requirement", () => {
  it("defaults to required and preserves existing critical-subject defaults", () => {
    expect(createAsignaturaValidation.parse(entrada)).toMatchObject({ requiereSala: true, esCritica: false, tiposHora: [], carrerasIds: [] });
  });
  it("accepts an explicit exemption on create/update without string coercion", () => {
    expect(createAsignaturaValidation.parse({ ...entrada, requiereSala: false }).requiereSala).toBe(false);
    expect(updateAsignaturaValidation.parse({ requiereSala: false })).toEqual({ requiereSala: false });
    expect(updateAsignaturaValidation.safeParse({ requiereSala: "false" }).success).toBe(false);
  });
  it("persists the create flag through the existing subject service", async () => {
    vi.mocked(asignaturasRepository.findByCodigo).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ...entrada, requiereSala: false } as never);
    await asignaturasService.createAsignatura(createAsignaturaValidation.parse({ ...entrada, requiereSala: false }));
    expect(asignaturasRepository.create).toHaveBeenCalledWith(expect.objectContaining({ requiereSala: false }), [], []);
  });
  it("explicitly exempts professional practices and degree project, not preliminary project", () => {
    for (const codigo of ["620449", "620456", "620477"]) expect(datosAsignaturas.find(asignatura => asignatura.codigo === codigo)).toMatchObject({ requiereSala: false });
    expect(datosAsignaturas.find(asignatura => asignatura.codigo === "620472")).toMatchObject({ requiereSala: true });
  });
});
