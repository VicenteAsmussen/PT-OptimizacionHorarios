import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { profesoresService } from "../services/profesores.service.js";

export const profesoresController = {
  async getSeleccion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validar el perfil de secretaria sin restringir la selección por departamento.
      await resolverAlcanceCarrera(req.user);
      const data = await profesoresService.getSeleccionProfesores();
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  },

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await profesoresService.getAllProfesores(req.query.departamentoId === undefined ? undefined : Number(req.query.departamentoId), await resolverAlcanceCarrera(req.user));
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
      const data = await profesoresService.getProfesorById(id, await resolverAlcanceCarrera(req.user));
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
      const data = await profesoresService.createProfesor(req.body, await resolverAlcanceCarrera(req.user), req.user);
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
      const data = await profesoresService.updateProfesor(id, req.body, await resolverAlcanceCarrera(req.user), req.user);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async createUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await profesoresService.createUsuarioProfesor(id, req.body, await resolverAlcanceCarrera(req.user), req.user);
      res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await profesoresService.updateUsuarioProfesor(id, req.body, await resolverAlcanceCarrera(req.user), req.user);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await profesoresService.deleteUsuarioProfesor(id, await resolverAlcanceCarrera(req.user), req.user);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await profesoresService.deleteProfesor(id, await resolverAlcanceCarrera(req.user), req.user);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
