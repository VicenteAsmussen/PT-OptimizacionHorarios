import type { Request, Response, NextFunction } from "express";
import { semestresService } from "../services/semestres.service.js";

export const semestresController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await semestresService.getAllSemestres();
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async getActual(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await semestresService.getSemestreActual();
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await semestresService.getSemestreById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await semestresService.createSemestre(req.body);
      res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await semestresService.updateSemestre(id, req.body);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async setActual(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await semestresService.setSemestreActual(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await semestresService.deleteSemestre(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
