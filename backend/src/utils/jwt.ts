import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "./errors.js";

export type RolUsuario = "secretaria" | "profesor" | "admin";

export interface TokenPayload {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

export interface ClaimsSesion extends TokenPayload {
  sid: string;
  exp: number;
  iat: number;
}

export function generateToken(payload: TokenPayload, sesionId?: string): string {
  const { id, nombre, correo, rol } = payload;
  return jwt.sign({ id, nombre, correo, rol, ...(sesionId ? { sid: sesionId } : {}) }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

export function verifyToken(token: string): ClaimsSesion {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof claims === "string" || !Number.isSafeInteger(claims.id) || claims.id <= 0 ||
        typeof claims.nombre !== "string" || typeof claims.correo !== "string" ||
        !["secretaria", "profesor", "admin"].includes(claims.rol) ||
        typeof claims.sid !== "string" || !/^[a-f0-9]{64}$/.test(claims.sid) ||
        !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.iat) || claims.exp! <= claims.iat!) {
      throw new Error("Claims inválidos");
    }
    return claims as ClaimsSesion;
  } catch {
    throw new UnauthorizedError("No autorizado: Token inválido o expirado");
  }
}
