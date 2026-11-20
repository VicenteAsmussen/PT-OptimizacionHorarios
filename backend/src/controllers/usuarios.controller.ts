import type { Request, Response, NextFunction } from "express";
import { usuariosService } from "../services/usuarios.service.js";

export const usuariosController = {
  // Presenta las cuentas sin claves ni versiones internas de sesión.
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await usuariosService.getAllUsuarios();
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Entrega el perfil público de la cuenta solicitada por la ruta administrativa.
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await usuariosService.getUsuarioById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma el alta validada de una cuenta y su perfil de secretaría cuando corresponde.
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await usuariosService.createUsuario(req.body);
      res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Devuelve el perfil público después de modificar los datos de la cuenta.
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await usuariosService.updateUsuario(id, req.body);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma sin cuerpo la eliminación de acceso permitida por las vinculaciones de la cuenta.
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await usuariosService.deleteUsuario(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
