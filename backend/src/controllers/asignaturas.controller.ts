import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { asignaturasService } from "../services/asignaturas.service.js";

export const asignaturasController = {
  // Responde con la malla visible para la carrera y el filtro departamental solicitados.
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

  // Presenta la definición académica del código accesible para el usuario.
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

  // Confirma el alta de la asignatura y sus relaciones validadas por el servicio.
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

  // Devuelve la asignatura después del mantenimiento autorizado de su definición.
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

  // Confirma sin cuerpo la eliminación de una asignatura permitida por los controles del catálogo.
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
