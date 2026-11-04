import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { optimizacionController as controlador } from "../controllers/optimizacion.controller.js";
import { identificadorEjecucion, inicioOptimizacion, parametrosOptimizacion } from "../validations/optimizacion.validation.js";

export const optimizacionRouter = Router();
optimizacionRouter.use(authenticate, authorizeRoles("admin", "secretaria"));
optimizacionRouter.get("/planificaciones/:id/preparacion", validateRequest({ params: parametrosOptimizacion }), controlador.preparar);
optimizacionRouter.get("/planificaciones/:id/ultima-ejecucion", validateRequest({ params: parametrosOptimizacion }), controlador.ultima);
optimizacionRouter.post("/planificaciones/:id/ejecuciones", validateRequest({ params: parametrosOptimizacion, body: inicioOptimizacion }), controlador.iniciar);
optimizacionRouter.get("/ejecuciones/:id", validateRequest({ params: identificadorEjecucion }), controlador.consultar);
