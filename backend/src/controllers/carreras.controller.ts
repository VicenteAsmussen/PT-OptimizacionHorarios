import type { Request, Response, NextFunction } from "express";
import { carrerasService } from "../services/carreras.service.js";

export const carrerasController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await carrerasService.getAllCarreras();
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
      const data = await carrerasService.getCarreraById(id);
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
      const data = await carrerasService.createCarrera(req.body);
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
      const data = await carrerasService.updateCarrera(id, req.body);
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
      await carrerasService.deleteCarrera(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
