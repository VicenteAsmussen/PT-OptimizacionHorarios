import { usuariosRepository } from "../repositories/usuarios.repository.js";
import { type LoginDTO } from "../validations/auth.validation.js";
import { comparePassword } from "../utils/password.js";
import { generateToken, verifyToken, type TokenPayload } from "../utils/jwt.js";
import { UnauthorizedError, NotFoundError } from "../utils/errors.js";

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

    const actual = await usuariosRepository.findById(user.id);
    if (!actual || actual.versionSesion !== user.versionSesion || actual.clave !== user.clave ||
        actual.correo !== user.correo || actual.rol !== user.rol) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const payload: TokenPayload = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
    };

    const token = generateToken(payload, user.versionSesion);
    const claims = verifyToken(token);

    return {
      user: sanitizeUser(user),
      token,
      expiraEn: claims.exp * 1000,
    };
  },

  async autenticar(token: string): Promise<TokenPayload> {
    const claims = verifyToken(token);
    const usuario = await usuariosRepository.findById(claims.id);
    if (!usuario || usuario.versionSesion !== claims.versionSesion) {
      throw new UnauthorizedError("No autorizado: Token inválido o expirado");
    }
    const { id, nombre, correo, rol } = usuario;
    return { id, nombre, correo, rol };
  },

  async getMe(userId: number) {
    const user = await usuariosRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("Usuario no encontrado");
    }
    return sanitizeUser(user);
  },
};
