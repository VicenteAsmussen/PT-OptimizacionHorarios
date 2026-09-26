import { usuariosRepository } from "../repositories/usuarios.repository.js";
import { type LoginDTO } from "../validations/auth.validation.js";
import { comparePassword } from "../utils/password.js";
import { generateToken, type TokenPayload } from "../utils/jwt.js";
import { UnauthorizedError, NotFoundError } from "../utils/errors.js";

function sanitizeUser<T extends { clave?: string }>(user: T): Omit<T, "clave"> {
  const { clave, ...rest } = user;
  return rest;
}

export const authService = {
  async login(dto: LoginDTO) {
    const user = await usuariosRepository.findByCorreo(dto.correo);
    if (!user) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const isValidPassword = await comparePassword(dto.clave, user.clave);
    if (!isValidPassword) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const payload: TokenPayload = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
    };

    const token = generateToken(payload);

    return {
      user: sanitizeUser(user),
      token,
    };
  },

  async getMe(userId: number) {
    const user = await usuariosRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("Usuario no encontrado");
    }
    return sanitizeUser(user);
  },
};
