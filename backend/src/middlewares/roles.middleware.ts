import type { Request, Response, NextFunction } from "express";
import { type RolUsuario } from "../utils/jwt.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

export function authorizeRoles(...allowedRoles: RolUsuario[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError("No autenticado"));
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return next(
        new ForbiddenError(
          `Acceso denegado: Se requiere uno de los roles [${allowedRoles.join(", ")}], tu rol actual es '${req.user.rol}'`
        )
      );
    }

    next();
  };
}
