import { sesionesRepository } from "../repositories/sesiones.repository.js";
import { verifyToken, type ClaimsSesion, type TokenPayload } from "../utils/jwt.js";
import { UnauthorizedError } from "../utils/errors.js";

export const sesionesService = {
  async autenticar(token: string): Promise<TokenPayload> {
    const claims = verifyToken(token);
    const sesion = await sesionesRepository.findById(claims.sid);
    if (!sesion || sesion.usuarioId !== claims.id || sesion.usuario.id !== claims.id ||
        sesion.expiraEn.getTime() <= Date.now() || sesion.expiraEn.getTime() !== claims.exp * 1000 ||
        sesion.usuario.rol !== claims.rol || sesion.usuario.correo !== claims.correo) {
      throw new UnauthorizedError("No autorizado: Token inválido o expirado");
    }
    const { id, nombre, correo, rol } = sesion.usuario;
    return { id, nombre, correo, rol };
  },

  async revocar(token?: string): Promise<void> {
    if (!token) return;
    let claims: ClaimsSesion;
    try {
      claims = verifyToken(token);
    } catch (error) {
      if (error instanceof UnauthorizedError) return;
      throw error;
    }
    await sesionesRepository.deleteById(claims.sid, claims.id);
  },
};
