import { Router } from "express";
import { disponibilidadController } from "../controllers/disponibilidad.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createDisponibilidadValidation,
  syncDisponibilidadValidation,
  disponibilidadQueryValidation,
  disponibilidadIdParamValidation,
  profesorSemestreParamValidation,
} from "../validations/disponibilidad.validation.js";

const router = Router();

// Todas las rutas de disponibilidad requieren estar autenticado
router.use(authenticate);

// Consultar disponibilidad: permitido para admin, secretaria y profesor
router.get(
  "/",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ query: disponibilidadQueryValidation }),
  disponibilidadController.get
);

router.get(
  "/:id",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ params: disponibilidadIdParamValidation }),
  disponibilidadController.getById
);

// Registrar, sincronizar y eliminar disponibilidad: restringido a docente y admin
router.post(
  "/",
  authorizeRoles("admin", "profesor"),
  validateRequest({ body: createDisponibilidadValidation }),
  disponibilidadController.create
);

router.post(
  "/sincronizar",
  authorizeRoles("admin", "profesor"),
  validateRequest({ body: syncDisponibilidadValidation }),
  disponibilidadController.sync
);

router.delete(
  "/:id",
  authorizeRoles("admin", "profesor"),
  validateRequest({ params: disponibilidadIdParamValidation }),
  disponibilidadController.delete
);

router.delete(
  "/profesor/:profesorId/semestre/:semestreId",
  authorizeRoles("admin", "profesor"),
  validateRequest({ params: profesorSemestreParamValidation }),
  disponibilidadController.clear
);

export { router as disponibilidadRouter };
