import type { Request, Response, NextFunction } from "express";
import { departamentosService } from "../services/departamentos.service.js";

export const departamentosController = {
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await departamentosService.getAllDepartamentos();
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
      const data = await departamentosService.getDepartamentoById(id);
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
      const data = await departamentosService.createDepartamento(req.body);
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
      const data = await departamentosService.updateDepartamento(id, req.body);
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
      await departamentosService.deleteDepartamento(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
