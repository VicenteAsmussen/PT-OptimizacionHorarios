import { Router } from "express";
import { semestresController } from "../controllers/semestres.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createSemestreValidation,
  updateSemestreValidation,
  semestreIdParamValidation,
} from "../validations/semestres.validation.js";

const router = Router();

// Todas las rutas de semestres requieren autenticación
router.use(authenticate);

// 1. Obtener semestre actual (permitido para admin, secretaria y profesor)
router.get(
  "/actual",
  authorizeRoles("admin", "secretaria", "profesor"),
  semestresController.getActual
);

// 2. Listar todos los semestres
router.get(
  "/",
  authorizeRoles("admin", "secretaria", "profesor"),
  semestresController.getAll
);

// 3. Obtener semestre por ID
router.get(
  "/:id",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ params: semestreIdParamValidation }),
  semestresController.getById
);

// 4. Crear semestre (exclusivo admin y secretaria)
router.post(
  "/",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ body: createSemestreValidation }),
  semestresController.create
);

// 5. Actualizar semestre (exclusivo admin y secretaria)
router.put(
  "/:id",
  authorizeRoles("admin", "secretaria"),
  validateRequest({
    params: semestreIdParamValidation,
    body: updateSemestreValidation,
  }),
  semestresController.update
);

// 6. Activar un semestre como actual (exclusivo admin y secretaria)
router.patch(
  "/:id/activar",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ params: semestreIdParamValidation }),
  semestresController.setActual
);

// 7. Eliminar semestre (exclusivo admin y secretaria)
router.delete(
  "/:id",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ params: semestreIdParamValidation }),
  semestresController.delete
);

export { router as semestresRouter };
