import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { departamentosRepository } from "../repositories/departamentos.repository.js";
import { type CreateDepartamentoDTO, type UpdateDepartamentoDTO } from "../validations/departamentos.validation.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";

export const departamentosService = {
  async getAllDepartamentos(alcance?: AlcanceCarrera) {
    return await departamentosRepository.findAll(alcance);
  },

  async getDepartamentoById(id: number, alcance?: AlcanceCarrera) {
    const departamento = await departamentosRepository.findById(id);
    if (!departamento || (alcance && !alcance.departamentosIds.includes(id))) {
      throw new NotFoundError(`Departamento con ID ${id} no encontrado`);
    }
    return departamento;
  },

  async createDepartamento(dto: CreateDepartamentoDTO) {
    const existing = await departamentosRepository.findByNombre(dto.nombre);
    if (existing) {
      throw new ConflictError(`Ya existe un departamento con el nombre '${dto.nombre}'`);
    }

    const created = await departamentosRepository.create(dto);
    return await this.getDepartamentoById(created.id);
  },

  async updateDepartamento(id: number, dto: UpdateDepartamentoDTO) {
    await this.getDepartamentoById(id);

    const existing = await departamentosRepository.findByNombre(dto.nombre);
    if (existing && existing.id !== id) {
      throw new ConflictError(`Ya existe otro departamento con el nombre '${dto.nombre}'`);
    }

    await departamentosRepository.update(id, dto);
    return await this.getDepartamentoById(id);
  },

  async deleteDepartamento(id: number) {
    await this.getDepartamentoById(id);
    await departamentosRepository.delete(id);
  },
};
