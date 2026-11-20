import type { Request, Response, NextFunction } from "express";
import { salasService } from "../services/salas.service.js";

export const salasController = {
  // Presenta el catálogo físico de salas para las consultas autorizadas por la ruta.
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await salasService.getAllSalas();
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Entrega la definición de una sala física registrada.
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await salasService.getSalaById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma el alta de una sala del catálogo, no una reserva de capacidad para el modelo.
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await salasService.createSala(req.body);
      res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Presenta la sala después del mantenimiento permitido por sus dependencias.
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await salasService.updateSala(id, req.body);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma sin cuerpo la eliminación de una sala sin uso académico que la impida.
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await salasService.deleteSala(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
