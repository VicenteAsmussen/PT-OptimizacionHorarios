import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { loginValidation } from "../validations/auth.validation.js";

const router = Router();

router.post(
  "/login",
  validateRequest({ body: loginValidation }),
  authController.login
);

router.post("/logout", authController.logout);

router.get("/me", authenticate, authController.getMe);

export { router as authRouter };
