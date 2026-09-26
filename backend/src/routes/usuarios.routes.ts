import { Router } from "express";
import { usuariosController } from "../controllers/usuarios.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createUsuarioValidation,
  updateUsuarioValidation,
  usuarioIdParamValidation,
} from "../validations/usuarios.validation.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin", "secretaria"));

router.get("/", usuariosController.getAll);

router.get(
  "/:id",
  validateRequest({ params: usuarioIdParamValidation }),
  usuariosController.getById
);

router.post(
  "/",
  validateRequest({ body: createUsuarioValidation }),
  usuariosController.create
);

router.put(
  "/:id",
  validateRequest({
    params: usuarioIdParamValidation,
    body: updateUsuarioValidation,
  }),
  usuariosController.update
);

router.delete(
  "/:id",
  validateRequest({ params: usuarioIdParamValidation }),
  usuariosController.delete
);

export { router as usuariosRouter };
