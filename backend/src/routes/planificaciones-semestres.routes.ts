import { Router } from "express";
import { planificacionesSemestresController as controlador } from "../controllers/planificaciones-semestres.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { createPlanificacionSemestreValidation, updatePlanificacionSemestreValidation, deletePlanificacionSemestreValidation, planificacionSemestreIdParamValidation, planificacionSemestreQueryValidation } from "../validations/planificaciones-semestres.validation.js";

const router = Router();
router.use(authenticate);
router.get("/", authorizeRoles("admin", "secretaria", "profesor"), validateRequest({ query: planificacionSemestreQueryValidation }), controlador.getAll);
router.get("/:id", authorizeRoles("admin", "secretaria", "profesor"), validateRequest({ params: planificacionSemestreIdParamValidation }), controlador.getById);
router.post("/", authorizeRoles("admin"), validateRequest({ body: createPlanificacionSemestreValidation }), controlador.create);
router.patch("/:id", authorizeRoles("admin"), validateRequest({ params: planificacionSemestreIdParamValidation, body: updatePlanificacionSemestreValidation }), controlador.update);
router.delete("/:id", authorizeRoles("admin"), validateRequest({ params: planificacionSemestreIdParamValidation, body: deletePlanificacionSemestreValidation }), controlador.delete);
export { router as planificacionesSemestresRouter };
