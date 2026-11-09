import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../utils/errors.js";
import { sesionesService } from "../services/sesiones.service.js";

export const COOKIE_AUTH_NAME = "auth_token";

export function extraerToken(req: Request): string | undefined {
  const cookie: unknown = req.cookies?.[COOKIE_AUTH_NAME];
  if (typeof cookie === "string" && cookie) return cookie;
  if (req.headers.authorization?.startsWith("Bearer ")) return req.headers.authorization.split(" ")[1];
  return undefined;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extraerToken(req);
    if (!token) {
      throw new UnauthorizedError("No autorizado: Token de autenticación no proporcionado");
    }

    req.user = await sesionesService.autenticar(token);
    next();
  } catch (error) {
    next(error);
  }
}
