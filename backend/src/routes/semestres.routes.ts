import { Router } from "express";
import { semestresController } from "../controllers/semestres.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import {
  createSemestreValidation,
  updateSemestreValidation,
  semestreIdParamValidation,
} from "../validations/semestres.validation.js";

const router = Router();

router.get("/", semestresController.getAll);

router.get(
  "/:id",
  validateRequest({ params: semestreIdParamValidation }),
  semestresController.getById
);

router.post(
  "/",
  validateRequest({ body: createSemestreValidation }),
  semestresController.create
);

router.put(
  "/:id",
  validateRequest({
    params: semestreIdParamValidation,
    body: updateSemestreValidation,
  }),
  semestresController.update
);

router.delete(
  "/:id",
  validateRequest({ params: semestreIdParamValidation }),
  semestresController.delete
);

export { router as semestresRouter };
