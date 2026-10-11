import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { disponibilidadService } from "../services/disponibilidad.service.js";

export const disponibilidadController = {
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await disponibilidadService.getDisponibilidad(req.query as any, await resolverAlcanceCarrera(req.user));
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
      const data = await disponibilidadService.getById(id, await resolverAlcanceCarrera(req.user));
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
      const data = await disponibilidadService.createSingle(req.body, await resolverAlcanceCarrera(req.user));
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
      const data = await disponibilidadService.syncGrid(req.body, await resolverAlcanceCarrera(req.user));
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
      await disponibilidadService.deleteSingle(id, await resolverAlcanceCarrera(req.user));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async clear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profesorId = Number(req.params.profesorId);
      const semestreId = Number(req.params.semestreId);
      await disponibilidadService.clearGrid(profesorId, semestreId, await resolverAlcanceCarrera(req.user));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
