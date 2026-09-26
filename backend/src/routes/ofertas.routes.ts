import { Router } from "express";
import { ofertasController } from "../controllers/ofertas.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createOfertaValidation,
  updateOfertaValidation,
  ofertaIdParamValidation,
  ofertaQueryValidation,
} from "../validations/ofertas.validation.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin", "secretaria"));

router.get(
  "/",
  validateRequest({ query: ofertaQueryValidation }),
  ofertasController.getAll
);

router.get(
  "/:id",
  validateRequest({ params: ofertaIdParamValidation }),
  ofertasController.getById
);

router.post(
  "/",
  validateRequest({ body: createOfertaValidation }),
  ofertasController.create
);

router.put(
  "/:id",
  validateRequest({
    params: ofertaIdParamValidation,
    body: updateOfertaValidation,
  }),
  ofertasController.update
);

router.delete(
  "/:id",
  validateRequest({ params: ofertaIdParamValidation }),
  ofertasController.delete
);

export { router as ofertasRouter };
