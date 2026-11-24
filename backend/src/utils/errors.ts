import type { DocenteSinDisponibilidad } from "./disponibilidad-docente.js";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  // Conserva el mensaje de dominio y su estado HTTP para la respuesta centralizada.
  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  // Representa la ausencia de un recurso solicitado sin cambiar el contrato HTTP 404.
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  // Representa una entrada que no satisface las condiciones requeridas por la operación.
  constructor(message = "Bad request") {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  // Representa un conflicto entre la operación solicitada y el estado académico vigente.
  constructor(message = "Conflict occurred") {
    super(message, 409);
  }
}

export class DisponibilidadNoRegistradaError extends ConflictError {
  readonly codigo = "disponibilidad_no_registrada";

  constructor(public readonly docentesSinDisponibilidad: DocenteSinDisponibilidad[]) {
    super("No se puede iniciar la optimización.");
  }
}

export class UnauthorizedError extends AppError {
  // Representa la falta de una autenticación válida para acceder a la operación.
  constructor(message = "Unauthorized access") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  // Representa una operación que la identidad o el alcance del usuario no permiten.
  constructor(message = "Forbidden access") {
    super(message, 403);
  }
}

