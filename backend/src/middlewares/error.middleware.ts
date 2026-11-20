import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";

function obtenerEstadoErrorJson(error: unknown): 400 | 413 | undefined {
  if (!(error instanceof Error) || !("type" in error)) return;

  const codigo = error.type === "entity.parse.failed" ? 400
    : error.type === "entity.too.large" ? 413 : undefined;
  if (codigo === undefined) return;

  const estado = "status" in error ? error.status : undefined;
  const codigoEstado = "statusCode" in error ? error.statusCode : undefined;
  // Exigir un alias válido y rechazar estados contradictorios o no numéricos.
  if ((estado === codigo || codigoEstado === codigo)
    && (estado === undefined || estado === codigo)
    && (codigoEstado === undefined || codigoEstado === codigo)) {
    return codigo;
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: "error",
      statusCode: err.statusCode,
      message: err.message,
    });
    return;
  }

  const codigoJson = obtenerEstadoErrorJson(err);
  if (codigoJson !== undefined) {
    res.status(codigoJson).json({
      status: "error",
      statusCode: codigoJson,
      message: codigoJson === 400
        ? "El cuerpo contiene JSON no válido."
        : "El cuerpo de la solicitud es demasiado grande.",
    });
    return;
  }

  // Clasificar por prototipo, nunca copiar name, message, stack, cause o parámetros.
  const categoria = err instanceof TypeError ? "tipo"
    : err instanceof RangeError ? "rango"
    : err instanceof ReferenceError ? "referencia"
    : err instanceof SyntaxError ? "sintaxis" : "otro";
  const metodo = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(_req.method)
    ? _req.method : "otro";
  // Plantilla registrada por Express, no la URL con parámetros o consulta.
  const ruta = typeof _req.route?.path === "string" ? _req.route.path : "sin ruta";
  console.error("Error interno no controlado", { categoria, metodo, ruta });

  res.status(500).json({
    status: "error",
    statusCode: 500,
    message: "Internal server error",
  });
}
