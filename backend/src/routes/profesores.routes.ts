import { Router } from "express";
import { profesoresController } from "../controllers/profesores.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createProfesorValidation,
  updateProfesorValidation,
  profesorIdParamValidation,
  profesorQueryValidation,
  accesoProfesorValidation,
  updateAccesoProfesorValidation,
} from "../validations/profesores.validation.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin", "secretaria"));

router.get("/", validateRequest({ query: profesorQueryValidation }), profesoresController.getAll);

router.get("/seleccion", profesoresController.getSeleccion);

router.post(
  "/",
  validateRequest({ body: createProfesorValidation }),
  profesoresController.create
);

router.get(
  "/:id",
  validateRequest({ params: profesorIdParamValidation }),
  profesoresController.getById
);

router.put(
  "/:id",
  validateRequest({
    params: profesorIdParamValidation,
    body: updateProfesorValidation,
  }),
  profesoresController.update
);

router.post(
  "/:id/usuario",
  validateRequest({
    params: profesorIdParamValidation,
    body: accesoProfesorValidation,
  }),
  profesoresController.createUsuario
);

router.put(
  "/:id/usuario",
  validateRequest({
    params: profesorIdParamValidation,
    body: updateAccesoProfesorValidation,
  }),
  profesoresController.updateUsuario
);

router.delete(
  "/:id/usuario",
  validateRequest({ params: profesorIdParamValidation }),
  profesoresController.deleteUsuario
);

router.delete(
  "/:id",
  validateRequest({ params: profesorIdParamValidation }),
  profesoresController.delete
);

export { router as profesoresRouter };
