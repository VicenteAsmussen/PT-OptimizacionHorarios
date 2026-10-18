import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { asignaturasService } from "../services/asignaturas.service.js";

export const asignaturasController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await asignaturasService.getAllAsignaturas(await resolverAlcanceCarrera(req.user), req.query.departamentoId === undefined ? undefined : Number(req.query.departamentoId));
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
      const data = await asignaturasService.getAsignaturaByCodigo(codigo, await resolverAlcanceCarrera(req.user));
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
      const data = await asignaturasService.createAsignatura(req.body, await resolverAlcanceCarrera(req.user));
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
      const data = await asignaturasService.updateAsignatura(codigo, req.body, await resolverAlcanceCarrera(req.user));
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
      await asignaturasService.deleteAsignatura(codigo, await resolverAlcanceCarrera(req.user));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
