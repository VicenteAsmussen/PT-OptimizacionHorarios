import { semestresRepository } from "../repositories/semestres.repository.js";
import { type CreateSemestreDTO, type UpdateSemestreDTO } from "../validations/semestres.validation.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";

export const semestresService = {
  async getAllSemestres() {
    return await semestresRepository.findAll();
  },

  async getSemestreById(id: number) {
    const semestre = await semestresRepository.findById(id);
    if (!semestre) {
      throw new NotFoundError(`Semestre con ID ${id} no encontrado`);
    }
    return semestre;
  },

  async createSemestre(dto: CreateSemestreDTO) {
    const existing = await semestresRepository.findByCodigo(dto.codigo);
    if (existing) {
      throw new ConflictError(`Ya existe un semestre con el código '${dto.codigo}'`);
    }

    return await semestresRepository.create(dto);
  },

  async updateSemestre(id: number, dto: UpdateSemestreDTO) {
    await this.getSemestreById(id);

    if (dto.codigo) {
      const existing = await semestresRepository.findByCodigo(dto.codigo);
      if (existing && existing.id !== id) {
        throw new ConflictError(`Ya existe otro semestre con el código '${dto.codigo}'`);
      }
    }

    const updated = await semestresRepository.update(id, dto);
    return updated;
  },

  async deleteSemestre(id: number) {
    await this.getSemestreById(id);
    await semestresRepository.delete(id);
  },
};
