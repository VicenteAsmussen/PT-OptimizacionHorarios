import { salasRepository } from "../repositories/salas.repository.js";
import { type CreateSalaDTO, type UpdateSalaDTO } from "../validations/salas.validation.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";

export const salasService = {
  async getAllSalas() {
    return await salasRepository.findAll();
  },

  async getSalaById(id: number) {
    const sala = await salasRepository.findById(id);
    if (!sala) {
      throw new NotFoundError(`Sala con ID ${id} no encontrada`);
    }
    return sala;
  },

  async createSala(dto: CreateSalaDTO) {
    const existing = await salasRepository.findByNombre(dto.nombre);
    if (existing) {
      throw new ConflictError(`Ya existe una sala con el nombre '${dto.nombre}'`);
    }

    return await salasRepository.create(dto);
  },

  async updateSala(id: number, dto: UpdateSalaDTO) {
    await this.getSalaById(id);

    if (dto.nombre) {
      const existing = await salasRepository.findByNombre(dto.nombre);
      if (existing && existing.id !== id) {
        throw new ConflictError(`Ya existe otra sala con el nombre '${dto.nombre}'`);
      }
    }

    const updated = await salasRepository.update(id, dto);
    return updated;
  },

  async deleteSala(id: number) {
    await this.getSalaById(id);
    await salasRepository.delete(id);
  },
};
