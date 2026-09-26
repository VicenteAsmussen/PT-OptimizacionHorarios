import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { UnauthorizedError } from "../utils/errors.js";

export const COOKIE_AUTH_NAME = "auth_token";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    let token: string | undefined = req.cookies?.[COOKIE_AUTH_NAME];

    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      throw new UnauthorizedError("No autorizado: Token de autenticación no proporcionado");
    }

    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError("No autorizado: Token inválido o expirado"));
    }
  }
}
