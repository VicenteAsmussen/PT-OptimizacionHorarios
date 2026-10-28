import type { Request, Response, NextFunction } from "express";
import { planificacionesSemestresService } from "../services/planificaciones-semestres.service.js";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";

export const planificacionesSemestresController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const carreraId = req.query.carreraId === undefined ? undefined : Number(req.query.carreraId);
      const data = await planificacionesSemestresService.getAll(carreraId, await resolverAlcanceCarrera(req.user), req.user);
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.getById(Number(req.params.id), await resolverAlcanceCarrera(req.user), req.user);
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.create(req.body, await resolverAlcanceCarrera(req.user));
      res.status(201).json({ status: "success", data });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.update(Number(req.params.id), req.body, await resolverAlcanceCarrera(req.user));
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.delete(Number(req.params.id), req.body.confirmacion, await resolverAlcanceCarrera(req.user));
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
};
