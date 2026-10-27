import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { planificacionSemestreIdParamValidation as params } from "../validations/planificaciones-semestres.validation.js";
import { resumenPeriodoValidation, reiniciarPeriodoValidation, estadoPeriodoValidation } from "../validations/administracion-periodos.validation.js";
import { administracionPeriodosController as controlador } from "../controllers/administracion-periodos.controller.js";

const router = Router();
router.use(authenticate, authorizeRoles("admin"));
router.get("/:id/resumen", validateRequest({ params, query: resumenPeriodoValidation }), controlador.resumen);
router.post("/:id/reiniciar", validateRequest({ params, body: reiniciarPeriodoValidation }), controlador.reiniciar);
router.patch("/:id/estado", validateRequest({ params, body: estadoPeriodoValidation }), controlador.cambiarEstado);
export { router as administracionPeriodosRouter };
