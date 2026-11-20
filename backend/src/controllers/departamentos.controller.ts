import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { departamentosService } from "../services/departamentos.service.js";

export const departamentosController = {
  // Presenta los departamentos relacionados con el alcance académico del usuario.
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await departamentosService.getAllDepartamentos(await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Devuelve el departamento solicitado si pertenece al alcance permitido.
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await departamentosService.getDepartamentoById(id, await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma el alta validada de un departamento del catálogo institucional.
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

  // Entrega el departamento después de aplicar el mantenimiento permitido.
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

  // Confirma sin cuerpo la eliminación del departamento permitida por sus dependencias.
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
