import { salasRepository } from "../repositories/salas.repository.js";
import { type CreateSalaDTO, type UpdateSalaDTO } from "../validations/salas.validation.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";

export const salasService = {
  // Presenta el catálogo de salas físicas, no su disponibilidad garantizada para el modelo.
  async getAllSalas() {
    return await salasRepository.findAll();
  },

  // Resuelve una sala registrada o informa que el recurso físico no existe.
  async getSalaById(id: number) {
    const sala = await salasRepository.findById(id);
    if (!sala) {
      throw new NotFoundError(`Sala con ID ${id} no encontrada`);
    }
    return sala;
  },

  // Incorpora una sala al catálogo después de descartar nombres repetidos.
  async createSala(dto: CreateSalaDTO) {
    const existing = await salasRepository.findByNombre(dto.nombre);
    if (existing) {
      throw new ConflictError(`Ya existe una sala con el nombre '${dto.nombre}'`);
    }

    return await salasRepository.create(dto);
  },

  // Valida el nombre y solicita el cambio sujeto al uso académico de la sala.
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

  // Solicita retirar una sala existente sin omitir el control de dependencias del repositorio.
  async deleteSala(id: number) {
    await this.getSalaById(id);
    await salasRepository.delete(id);
  },
};
