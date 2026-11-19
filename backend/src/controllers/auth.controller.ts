import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import { COOKIE_AUTH_NAME } from "../middlewares/auth.middleware.js";
import { env } from "../config/env.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
};

export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, token, expiraEn } = await authService.login(req.body);

      res.cookie(COOKIE_AUTH_NAME, token, { ...COOKIE_OPTIONS, maxAge: Math.max(0, expiraEn - Date.now()) });

      res.status(200).json({
        status: "success",
        data: {
          user,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.clearCookie(COOKIE_AUTH_NAME, COOKIE_OPTIONS);

      res.status(200).json({
        status: "success",
        message: "Sesión cerrada correctamente",
      });
    } catch (error) {
      next(error);
    }
  },

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.id);
      res.status(200).json({
        status: "success",
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },
};
