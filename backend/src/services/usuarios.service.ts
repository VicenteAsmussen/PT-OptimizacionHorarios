import { usuariosRepository } from "../repositories/usuarios.repository.js";
import { type CreateUsuarioDTO, type UpdateUsuarioDTO } from "../validations/usuarios.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

function sanitizeUser<T extends { clave?: string }>(user: T): Omit<T, "clave"> {
  const { clave, ...rest } = user;
  return rest;
}

export const usuariosService = {
  async getAllUsuarios() {
    const users = await usuariosRepository.findAll();
    return users.map(sanitizeUser);
  },

  async getUsuarioById(id: number) {
    const user = await usuariosRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
    }
    return sanitizeUser(user);
  },

  async createUsuario(dto: CreateUsuarioDTO) {
    const existing = await usuariosRepository.findByCorreo(dto.correo);
    if (existing) {
      throw new ConflictError(`Ya existe un usuario con el correo '${dto.correo}'`);
    }

    if (dto.rol === "secretaria") {
      if (!dto.carreraId) {
        throw new BadRequestError("Es obligatorio asociar una carrera a un usuario con rol 'secretaria'");
      }
      const carreraExists = await usuariosRepository.checkCarreraExists(dto.carreraId);
      if (!carreraExists) {
        throw new BadRequestError(`La carrera con ID ${dto.carreraId} no existe`);
      }
    }

    const { carreraId, ...userData } = dto;
    const created = await usuariosRepository.create(userData, carreraId);
    return await this.getUsuarioById(created.id);
  },

  async updateUsuario(id: number, dto: UpdateUsuarioDTO) {
    await this.getUsuarioById(id);

    if (dto.correo) {
      const existing = await usuariosRepository.findByCorreo(dto.correo);
      if (existing && existing.id !== id) {
        throw new ConflictError(`Ya existe otro usuario con el correo '${dto.correo}'`);
      }
    }

    if (dto.carreraId) {
      const carreraExists = await usuariosRepository.checkCarreraExists(dto.carreraId);
      if (!carreraExists) {
        throw new BadRequestError(`La carrera con ID ${dto.carreraId} no existe`);
      }
    }

    const { carreraId, ...userData } = dto;
    await usuariosRepository.update(id, userData, carreraId);

    return await this.getUsuarioById(id);
  },

  async deleteUsuario(id: number) {
    await this.getUsuarioById(id);
    await usuariosRepository.delete(id);
  },
};
