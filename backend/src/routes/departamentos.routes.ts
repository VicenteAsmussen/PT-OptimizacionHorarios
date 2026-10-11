import { Router } from "express";
import { departamentosController } from "../controllers/departamentos.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createDepartamentoValidation,
  updateDepartamentoValidation,
  departamentoIdParamValidation,
} from "../validations/departamentos.validation.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin", "secretaria"));

router.get("/", departamentosController.getAll);

router.get(
  "/:id",
  validateRequest({ params: departamentoIdParamValidation }),
  departamentosController.getById
);

router.post(
  "/",
  authorizeRoles("admin"),
  validateRequest({ body: createDepartamentoValidation }),
  departamentosController.create
);

router.put(
  "/:id",
  authorizeRoles("admin"),
  validateRequest({
    params: departamentoIdParamValidation,
    body: updateDepartamentoValidation,
  }),
  departamentosController.update
);

router.delete(
  "/:id",
  authorizeRoles("admin"),
  validateRequest({ params: departamentoIdParamValidation }),
  departamentosController.delete
);

export { router as departamentosRouter };
