import { Router } from "express";
import { disponibilidadController } from "../controllers/disponibilidad.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import {
  createDisponibilidadValidation,
  syncDisponibilidadValidation,
  disponibilidadQueryValidation,
  disponibilidadIdParamValidation,
  profesorSemestreParamValidation,
} from "../validations/disponibilidad.validation.js";

const router = Router();

router.get(
  "/",
  validateRequest({ query: disponibilidadQueryValidation }),
  disponibilidadController.get
);

router.get(
  "/:id",
  validateRequest({ params: disponibilidadIdParamValidation }),
  disponibilidadController.getById
);

router.post(
  "/",
  validateRequest({ body: createDisponibilidadValidation }),
  disponibilidadController.create
);

router.post(
  "/sincronizar",
  validateRequest({ body: syncDisponibilidadValidation }),
  disponibilidadController.sync
);

router.delete(
  "/:id",
  validateRequest({ params: disponibilidadIdParamValidation }),
  disponibilidadController.delete
);

router.delete(
  "/profesor/:profesorId/semestre/:semestreId",
  validateRequest({ params: profesorSemestreParamValidation }),
  disponibilidadController.clear
);

export { router as disponibilidadRouter };
