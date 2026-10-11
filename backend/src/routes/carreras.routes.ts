import { Router } from "express";
import { carrerasController } from "../controllers/carreras.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createCarreraValidation,
  updateCarreraValidation,
  carreraIdParamValidation,
} from "../validations/carreras.validation.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin", "secretaria"));

router.get("/", carrerasController.getAll);

router.get(
  "/:id",
  validateRequest({ params: carreraIdParamValidation }),
  carrerasController.getById
);

router.post(
  "/",
  authorizeRoles("admin"),
  validateRequest({ body: createCarreraValidation }),
  carrerasController.create
);

router.put(
  "/:id",
  authorizeRoles("admin"),
  validateRequest({
    params: carreraIdParamValidation,
    body: updateCarreraValidation,
  }),
  carrerasController.update
);

router.delete(
  "/:id",
  authorizeRoles("admin"),
  validateRequest({ params: carreraIdParamValidation }),
  carrerasController.delete
);

export { router as carrerasRouter };
