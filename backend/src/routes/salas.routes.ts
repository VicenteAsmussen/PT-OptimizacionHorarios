import { Router } from "express";
import { salasController } from "../controllers/salas.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createSalaValidation,
  updateSalaValidation,
  salaIdParamValidation,
} from "../validations/salas.validation.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin", "secretaria"));

router.get("/", salasController.getAll);

router.get(
  "/:id",
  validateRequest({ params: salaIdParamValidation }),
  salasController.getById
);

router.post(
  "/",
  validateRequest({ body: createSalaValidation }),
  salasController.create
);

router.put(
  "/:id",
  validateRequest({
    params: salaIdParamValidation,
    body: updateSalaValidation,
  }),
  salasController.update
);

router.delete(
  "/:id",
  validateRequest({ params: salaIdParamValidation }),
  salasController.delete
);

export { router as salasRouter };
