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
  profesorPlanificacionParamValidation,
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

// Secretaria puede mutar únicamente profesores de departamentos vinculados a su carrera.
router.post(
  "/",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ body: createDisponibilidadValidation }),
  disponibilidadController.create
);

router.post(
  "/sincronizar",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ body: syncDisponibilidadValidation }),
  disponibilidadController.sync
);

router.delete(
  "/:id",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ params: disponibilidadIdParamValidation }),
  disponibilidadController.delete
);

router.delete(
  "/profesor/:profesorId/planificacion-semestre/:planificacionSemestreId",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ params: profesorPlanificacionParamValidation }),
  disponibilidadController.clear
);

export { router as disponibilidadRouter };
