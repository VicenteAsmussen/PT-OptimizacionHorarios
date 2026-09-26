import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny, ZodError } from "zod";
import { BadRequestError } from "../utils/errors.js";

interface RequestValidationSchema {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validateRequest(schemas: RequestValidationSchema) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        const parsedQuery = (await schemas.query.parseAsync(req.query)) as Request["query"];
        Object.defineProperty(req, "query", {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.params) {
        const parsedParams = (await schemas.params.parseAsync(req.params)) as Request["params"];
        Object.defineProperty(req, "params", {
          value: parsedParams,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error) {
        const zodError = error as ZodError;
        const messages = zodError.issues
          .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`)
          .join("; ");
        next(new BadRequestError(`Error de validación: ${messages}`));
        return;
      }
      next(error);
    }
  };
}
