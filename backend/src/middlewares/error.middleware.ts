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

  console.error("Unhandled Error:", err);

  res.status(500).json({
    status: "error",
    statusCode: 500,
    message: "Internal server error",
  });
}
