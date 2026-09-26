import { Router } from "express";
import { horariosController } from "../controllers/horarios.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createHorarioValidation,
  updateHorarioValidation,
  horarioIdParamValidation,
  ofertaParamValidation,
  horarioQueryValidation,
} from "../validations/horarios.validation.js";

const router = Router();

// Todas las rutas requieren estar autenticado
router.use(authenticate);

// Consultar horarios: permitido para admin, secretaria y profesor
router.get(
  "/",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ query: horarioQueryValidation }),
  horariosController.getAll
);

router.get(
  "/:id",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ params: horarioIdParamValidation }),
  horariosController.getById
);

// Gestión y asignación de horarios: exclusivo para admin y secretaria
router.post(
  "/",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ body: createHorarioValidation }),
  horariosController.create
);

router.put(
  "/:id",
  authorizeRoles("admin", "secretaria"),
  validateRequest({
    params: horarioIdParamValidation,
    body: updateHorarioValidation,
  }),
  horariosController.update
);

router.delete(
  "/:id",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ params: horarioIdParamValidation }),
  horariosController.delete
);

router.delete(
  "/oferta/:ofertaId",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ params: ofertaParamValidation }),
  horariosController.deleteByOferta
);

export { router as horariosRouter };
