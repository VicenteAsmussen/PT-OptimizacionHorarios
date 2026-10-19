import { Router } from "express";
import { planificacionesSemestresController as controlador } from "../controllers/planificaciones-semestres.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { createPlanificacionSemestreValidation, updatePlanificacionSemestreValidation, planificacionSemestreIdParamValidation, planificacionSemestreQueryValidation } from "../validations/planificaciones-semestres.validation.js";

const router = Router();
router.use(authenticate);
router.get("/", authorizeRoles("admin", "secretaria", "profesor"), validateRequest({ query: planificacionSemestreQueryValidation }), controlador.getAll);
router.get("/:id", authorizeRoles("admin", "secretaria", "profesor"), validateRequest({ params: planificacionSemestreIdParamValidation }), controlador.getById);
router.post("/", authorizeRoles("admin", "secretaria"), validateRequest({ body: createPlanificacionSemestreValidation }), controlador.create);
router.patch("/:id", authorizeRoles("admin", "secretaria"), validateRequest({ params: planificacionSemestreIdParamValidation, body: updatePlanificacionSemestreValidation }), controlador.update);
// T3: transiciones y descarte explícitos; no DELETE/estado genérico que reabra entradas.
export { router as planificacionesSemestresRouter };
