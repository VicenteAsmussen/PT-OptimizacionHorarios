import { usuariosRepository } from "../repositories/usuarios.repository.js";
import { type LoginDTO } from "../validations/auth.validation.js";
import { comparePassword } from "../utils/password.js";
import { generateToken, verifyToken, type TokenPayload } from "../utils/jwt.js";
import { UnauthorizedError, NotFoundError } from "../utils/errors.js";
import { randomBytes } from "node:crypto";
import { sesionesRepository } from "../repositories/sesiones.repository.js";

function sanitizeUser<T extends { clave?: string; versionSesion?: number }>(user: T): Omit<T, "clave" | "versionSesion"> {
  const { clave, versionSesion, ...rest } = user;
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

    const sesionId = randomBytes(32).toString("hex");
    const token = generateToken(payload, sesionId);
    const claims = verifyToken(token);
    const creada = await sesionesRepository.createConCredenciales(user, {
      id: sesionId, usuarioId: user.id, expiraEn: new Date(claims.exp * 1000),
    });
    if (!creada) throw new UnauthorizedError("Credenciales inválidas");

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
