import { Router } from "express";
import { profesoresController } from "../controllers/profesores.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import {
  createProfesorValidation,
  updateProfesorValidation,
  profesorIdParamValidation,
} from "../validations/profesores.validation.js";

const router = Router();

router.get("/", profesoresController.getAll);

router.get(
  "/:id",
  validateRequest({ params: profesorIdParamValidation }),
  profesoresController.getById
);

router.post(
  "/",
  validateRequest({ body: createProfesorValidation }),
  profesoresController.create
);

router.put(
  "/:id",
  validateRequest({
    params: profesorIdParamValidation,
    body: updateProfesorValidation,
  }),
  profesoresController.update
);

router.delete(
  "/:id",
  validateRequest({ params: profesorIdParamValidation }),
  profesoresController.delete
);

export { router as profesoresRouter };
