import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { carrerasService } from "../services/carreras.service.js";

export const carrerasController = {
  // Presenta las carreras que el perfil autenticado puede consultar.
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await carrerasService.getAllCarreras(await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Responde con los vínculos académicos de la carrera accesible solicitada.
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await carrerasService.getCarreraById(id, await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma el registro de la carrera y sus departamentos asociados.
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

  // Entrega la carrera resultante del mantenimiento validado por el servicio.
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

  // Confirma sin cuerpo el retiro de una carrera sin dependencias que lo impidan.
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
