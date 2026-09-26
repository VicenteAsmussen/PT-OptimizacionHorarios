import type { Request, Response, NextFunction } from "express";
import { ofertasService } from "../services/ofertas.service.js";
import { type OfertaQueryDTO } from "../validations/ofertas.validation.js";

export const ofertasController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await ofertasService.getAllOfertas(req.query as unknown as OfertaQueryDTO);
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
      const data = await ofertasService.getOfertaById(id);
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
      const data = await ofertasService.createOferta(req.body);
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
      const data = await ofertasService.updateOferta(id, req.body);
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
      await ofertasService.deleteOferta(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
