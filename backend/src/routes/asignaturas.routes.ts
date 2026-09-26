import { Router } from "express";
import { asignaturasController } from "../controllers/asignaturas.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createAsignaturaValidation,
  updateAsignaturaValidation,
  asignaturaCodigoParamValidation,
} from "../validations/asignaturas.validation.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin", "secretaria"));

router.get("/", asignaturasController.getAll);

router.get(
  "/:codigo",
  validateRequest({ params: asignaturaCodigoParamValidation }),
  asignaturasController.getByCodigo
);

router.post(
  "/",
  validateRequest({ body: createAsignaturaValidation }),
  asignaturasController.create
);

router.put(
  "/:codigo",
  validateRequest({
    params: asignaturaCodigoParamValidation,
    body: updateAsignaturaValidation,
  }),
  asignaturasController.update
);

router.delete(
  "/:codigo",
  validateRequest({ params: asignaturaCodigoParamValidation }),
  asignaturasController.delete
);

export { router as asignaturasRouter };
