import { usuariosRepository } from "../repositories/usuarios.repository.js";
import { type CreateUsuarioDTO, type UpdateUsuarioDTO } from "../validations/usuarios.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";

// Omite credenciales y control interno de sesiones de las respuestas de cuentas.
function sanitizeUser<T extends { clave?: string; versionSesion?: number }>(user: T): Omit<T, "clave" | "versionSesion"> {
  const { clave, versionSesion, ...rest } = user;
  return rest;
}

export const usuariosService = {
  // Presenta las cuentas registradas sin sus campos internos de autenticación.
  async getAllUsuarios() {
    const users = await usuariosRepository.findAll();
    return users.map(sanitizeUser);
  },

  // Resuelve el perfil público de una cuenta para el mantenimiento administrativo.
  async getUsuarioById(id: number) {
    const user = await usuariosRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`Usuario con ID ${id} no encontrado`);
    }
    return sanitizeUser(user);
  },

  // Registra acceso con clave derivada y exige carrera existente para una cuenta de secretaría.
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
    const hashedPassword = await hashPassword(userData.clave);

    const created = await usuariosRepository.create(
      {
        ...userData,
        clave: hashedPassword,
      },
      carreraId
    );
    return await this.getUsuarioById(created.id);
  },

  // Valida cambios de correo y carrera y deriva la nueva clave antes de actualizar la cuenta.
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
    const dataToUpdate = { ...userData };

    if (dataToUpdate.clave) {
      dataToUpdate.clave = await hashPassword(dataToUpdate.clave);
    }

    await usuariosRepository.update(id, dataToUpdate, carreraId);

    return await this.getUsuarioById(id);
  },

  // Solicita eliminar una cuenta existente sin eliminar explícitamente su perfil académico.
  async deleteUsuario(id: number) {
    await this.getUsuarioById(id);
    await usuariosRepository.delete(id);
  },
};
