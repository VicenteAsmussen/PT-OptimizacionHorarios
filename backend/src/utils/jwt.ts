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

export interface ClaimsAutenticacion extends TokenPayload {
  versionSesion: number;
  exp: number;
  iat: number;
}

// Firma la identidad y la versión de sesión con la expiración configurada para el acceso.
export function generateToken(payload: TokenPayload, versionSesion: number): string {
  const { id, nombre, correo, rol } = payload;
  return jwt.sign({ id, nombre, correo, rol, versionSesion }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

// Exige firma, expiración y campos de identidad válidos antes de contrastar la sesión con la cuenta.
export function verifyToken(token: string): ClaimsAutenticacion {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof claims === "string" || !Number.isSafeInteger(claims.id) || claims.id <= 0 ||
        typeof claims.nombre !== "string" || typeof claims.correo !== "string" ||
        !["secretaria", "profesor", "admin"].includes(claims.rol) ||
        !Number.isSafeInteger(claims.versionSesion) || claims.versionSesion < 0 ||
        !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.iat) || claims.exp! <= claims.iat!) {
      throw new Error("Claims inválidos");
    }
    return claims as ClaimsAutenticacion;
  } catch {
    throw new UnauthorizedError("No autorizado: Token inválido o expirado");
  }
}
