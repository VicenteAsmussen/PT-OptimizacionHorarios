import type { Request, Response, NextFunction } from "express";
import { asignaturasService } from "../services/asignaturas.service.js";

export const asignaturasController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await asignaturasService.getAllAsignaturas();
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async getByCodigo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const codigo = String(req.params.codigo);
      const data = await asignaturasService.getAsignaturaByCodigo(codigo);
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
      const data = await asignaturasService.createAsignatura(req.body);
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
      const codigo = String(req.params.codigo);
      const data = await asignaturasService.updateAsignatura(codigo, req.body);
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
      const codigo = String(req.params.codigo);
      await asignaturasService.deleteAsignatura(codigo);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
