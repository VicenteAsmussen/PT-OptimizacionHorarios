import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { profesoresService } from "../services/profesores.service.js";

export const profesoresController = {
  // Entrega la selección docente transversal tras validar el perfil de secretaría cuando corresponde.
  async getSeleccion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Valida el perfil de secretaría sin restringir la selección por departamento.
      await resolverAlcanceCarrera(req.user);
      const data = await profesoresService.getSeleccionProfesores();
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  },

  // Presenta perfiles docentes con filtros departamentales sujetos al alcance de carrera.
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

  // Responde con el perfil académico accesible del profesor solicitado.
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

  // Confirma el alta del perfil y su acceso opcional según las facultades del actor.
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

  // Devuelve el perfil después de validar sus cambios y la cuenta vinculada.
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

  // Confirma la habilitación de acceso del profesor sin crear otro perfil académico.
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

  // Presenta el perfil tras actualizar las credenciales que el actor puede gestionar.
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

  // Confirma el retiro del acceso sin solicitar la eliminación de sus datos académicos.
  async deleteUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await profesoresService.deleteUsuarioProfesor(id, await resolverAlcanceCarrera(req.user), req.user);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  // Confirma el retiro del perfil que permiten el rol, el alcance y sus dependencias.
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
