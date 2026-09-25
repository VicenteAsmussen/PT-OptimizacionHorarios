import { Router } from "express";
import { usuariosController } from "../controllers/usuarios.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import {
  createUsuarioValidation,
  updateUsuarioValidation,
  usuarioIdParamValidation,
} from "../validations/usuarios.validation.js";

const router = Router();

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
