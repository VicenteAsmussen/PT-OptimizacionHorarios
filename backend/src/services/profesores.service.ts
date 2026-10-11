import { exigirEnAlcance, type AlcanceCarrera } from "../utils/alcance-carrera.js";
import { profesoresRepository } from "../repositories/profesores.repository.js";
import { type CreateProfesorDTO, type UpdateProfesorDTO } from "../validations/profesores.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

export const profesoresService = {
  async getAllProfesores(departamentoId?: number, alcance?: AlcanceCarrera) {
    if (departamentoId !== undefined) exigirEnAlcance(alcance?.departamentosIds, departamentoId);
    return await profesoresRepository.findAll(departamentoId, alcance);
  },

  async getProfesorById(id: number, alcance?: AlcanceCarrera) {
    const profesor = await profesoresRepository.findById(id, alcance);
    if (!profesor || (alcance && !alcance.departamentosIds.includes(profesor.departamentoId))) {
      throw new NotFoundError(`Profesor con ID ${id} no encontrado`);
    }
    return profesor;
  },

  async createProfesor(dto: CreateProfesorDTO, alcance?: AlcanceCarrera) {
    exigirEnAlcance(alcance?.departamentosIds, dto.departamentoId);
    const deptoExists = await profesoresRepository.checkDepartamentoExists(dto.departamentoId);
    if (!deptoExists) {
      throw new BadRequestError(`El departamento con ID ${dto.departamentoId} no existe`);
    }

    if (dto.usuarioId) {
      const userExists = await profesoresRepository.checkUsuarioExists(dto.usuarioId);
      if (!userExists) {
        throw new BadRequestError(`El usuario con ID ${dto.usuarioId} no existe`);
      }

      const existingLinked = await profesoresRepository.findByUsuarioId(dto.usuarioId);
      if (existingLinked) {
        throw new ConflictError(`El usuario con ID ${dto.usuarioId} ya está vinculado al profesor '${existingLinked.nombre}'`);
      }
    }

    const created = await profesoresRepository.create(dto);
    return await this.getProfesorById(created.id, alcance);
  },

  async updateProfesor(id: number, dto: UpdateProfesorDTO, alcance?: AlcanceCarrera) {
    const profesor = await this.getProfesorById(id, alcance);
    exigirEnAlcance(alcance?.departamentosIds, dto.departamentoId ?? profesor.departamentoId);

    if (dto.departamentoId) {
      const deptoExists = await profesoresRepository.checkDepartamentoExists(dto.departamentoId);
      if (!deptoExists) {
        throw new BadRequestError(`El departamento con ID ${dto.departamentoId} no existe`);
      }
    }

    if (dto.usuarioId) {
      const userExists = await profesoresRepository.checkUsuarioExists(dto.usuarioId);
      if (!userExists) {
        throw new BadRequestError(`El usuario con ID ${dto.usuarioId} no existe`);
      }

      const existingLinked = await profesoresRepository.findByUsuarioId(dto.usuarioId);
      if (existingLinked && existingLinked.id !== id) {
        throw new ConflictError(`El usuario con ID ${dto.usuarioId} ya está vinculado a otro profesor`);
      }
    }

    await profesoresRepository.update(id, dto);
    return await this.getProfesorById(id, alcance);
  },

  async deleteProfesor(id: number) {
    await this.getProfesorById(id);
    await profesoresRepository.delete(id);
  },
};
