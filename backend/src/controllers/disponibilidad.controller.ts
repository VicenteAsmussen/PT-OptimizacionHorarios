import type { Request, Response, NextFunction } from "express";
import { disponibilidadService } from "../services/disponibilidad.service.js";

export const disponibilidadController = {
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await disponibilidadService.getDisponibilidad(req.query as any);
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
      const data = await disponibilidadService.getById(id);
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
      const data = await disponibilidadService.createSingle(req.body);
      res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async sync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await disponibilidadService.syncGrid(req.body);
      res.status(200).json({
        status: "success",
        message: "Disponibilidad horaria sincronizada con éxito",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await disponibilidadService.deleteSingle(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async clear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profesorId = Number(req.params.profesorId);
      const semestreId = Number(req.params.semestreId);
      await disponibilidadService.clearGrid(profesorId, semestreId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
