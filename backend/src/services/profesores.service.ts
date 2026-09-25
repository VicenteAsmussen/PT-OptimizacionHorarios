import { profesoresRepository } from "../repositories/profesores.repository.js";
import { type CreateProfesorDTO, type UpdateProfesorDTO } from "../validations/profesores.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

export const profesoresService = {
  async getAllProfesores() {
    return await profesoresRepository.findAll();
  },

  async getProfesorById(id: number) {
    const profesor = await profesoresRepository.findById(id);
    if (!profesor) {
      throw new NotFoundError(`Profesor con ID ${id} no encontrado`);
    }
    return profesor;
  },

  async createProfesor(dto: CreateProfesorDTO) {
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
    return await this.getProfesorById(created.id);
  },

  async updateProfesor(id: number, dto: UpdateProfesorDTO) {
    await this.getProfesorById(id);

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
    return await this.getProfesorById(id);
  },

  async deleteProfesor(id: number) {
    await this.getProfesorById(id);
    await profesoresRepository.delete(id);
  },
};
