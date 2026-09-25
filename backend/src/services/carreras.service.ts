import { carrerasRepository } from "../repositories/carreras.repository.js";
import { type CreateCarreraDTO, type UpdateCarreraDTO } from "../validations/carreras.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

export const carrerasService = {
  async getAllCarreras() {
    return await carrerasRepository.findAll();
  },

  async getCarreraById(id: number) {
    const carrera = await carrerasRepository.findById(id);
    if (!carrera) {
      throw new NotFoundError(`Carrera con ID ${id} no encontrada`);
    }
    return carrera;
  },

  async createCarrera(dto: CreateCarreraDTO) {
    const existing = await carrerasRepository.findByNombre(dto.nombre);
    if (existing) {
      throw new ConflictError(`Ya existe una carrera con el nombre '${dto.nombre}'`);
    }

    if (dto.departamentosIds && dto.departamentosIds.length > 0) {
      const ids = dto.departamentosIds;
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        throw new BadRequestError("No se pueden duplicar departamentos en una misma carrera");
      }

      const existingIds = await carrerasRepository.findExistingDepartamentosIds(ids);
      const missingIds = ids.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0) {
        throw new BadRequestError(
          `Los siguientes departamentos no existen: [${missingIds.join(", ")}]`
        );
      }
    }

    const created = await carrerasRepository.create(
      { nombre: dto.nombre },
      dto.departamentosIds
    );

    return await this.getCarreraById(created.id);
  },

  async updateCarrera(id: number, dto: UpdateCarreraDTO) {
    await this.getCarreraById(id);

    if (dto.nombre) {
      const existing = await carrerasRepository.findByNombre(dto.nombre);
      if (existing && existing.id !== id) {
        throw new ConflictError(`Ya existe otra carrera con el nombre '${dto.nombre}'`);
      }
    }

    if (dto.departamentosIds && dto.departamentosIds.length > 0) {
      const ids = dto.departamentosIds;
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        throw new BadRequestError("No se pueden duplicar departamentos en una misma carrera");
      }

      const existingIds = await carrerasRepository.findExistingDepartamentosIds(ids);
      const missingIds = ids.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0) {
        throw new BadRequestError(
          `Los siguientes departamentos no existen: [${missingIds.join(", ")}]`
        );
      }
    }

    const { departamentosIds, ...datosBase } = dto;
    await carrerasRepository.update(id, datosBase, departamentosIds);

    return await this.getCarreraById(id);
  },

  async deleteCarrera(id: number) {
    await this.getCarreraById(id);
    await carrerasRepository.delete(id);
  },
};
