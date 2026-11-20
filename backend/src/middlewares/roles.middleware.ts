import type { Request, Response, NextFunction } from "express";
import { type RolUsuario } from "../utils/jwt.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

// Restringe la operación a los roles declarados por su ruta.
export function authorizeRoles(...allowedRoles: RolUsuario[]) {
  // Rechaza identidades ausentes o roles no habilitados antes de continuar la operación.
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
