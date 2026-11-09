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
  miDisponibilidadQueryValidation,
  miDisponibilidadValidation,
  seguimientoDisponibilidadQueryValidation,
} from "../validations/disponibilidad.validation.js";

const router = Router();

// Todas las rutas de disponibilidad requieren estar autenticado
router.use(authenticate);

router.get("/seguimiento", authorizeRoles("secretaria"),
  validateRequest({ query: seguimientoDisponibilidadQueryValidation }), disponibilidadController.getSeguimiento);

router.get("/mi-disponibilidad", authorizeRoles("profesor"),
  validateRequest({ query: miDisponibilidadQueryValidation }), disponibilidadController.getMiDisponibilidad);
router.post("/mi-disponibilidad", authorizeRoles("profesor"),
  validateRequest({ body: miDisponibilidadValidation }), disponibilidadController.guardarMiDisponibilidad);

// La disponibilidad general solo admite consulta administrativa y seguimiento.
router.get(
  "/",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ query: disponibilidadQueryValidation }),
  disponibilidadController.get
);

router.get(
  "/:id",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ params: disponibilidadIdParamValidation }),
  disponibilidadController.getById
);

// Las escrituras solo se ofrecen en mi-disponibilidad, con identidad docente propia.
router.post(
  "/",
  authorizeRoles(),
  validateRequest({ body: createDisponibilidadValidation }),
  disponibilidadController.create
);

router.post(
  "/sincronizar",
  authorizeRoles(),
  validateRequest({ body: syncDisponibilidadValidation }),
  disponibilidadController.sync
);

router.delete(
  "/:id",
  authorizeRoles(),
  validateRequest({ params: disponibilidadIdParamValidation }),
  disponibilidadController.delete
);

router.delete(
  "/profesor/:profesorId/planificacion-semestre/:planificacionSemestreId",
  authorizeRoles(),
  validateRequest({ params: profesorPlanificacionParamValidation }),
  disponibilidadController.clear
);

export { router as disponibilidadRouter };
