import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { ofertasService } from "../services/ofertas.service.js";
import { type OfertaQueryDTO } from "../validations/ofertas.validation.js";

export const ofertasController = {
  // Presenta las secciones ofertadas que corresponden a los filtros y al alcance del usuario.
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await ofertasService.getAllOfertas(req.query as unknown as OfertaQueryDTO, await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Entrega una oferta accesible con su asignación docente por componente.
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await ofertasService.getOfertaById(id, await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma la creación validada de una sección en el período de planificación.
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await ofertasService.createOferta(req.body, await resolverAlcanceCarrera(req.user));
      res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Presenta la oferta después de los cambios autorizados en sección y asignaciones.
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await ofertasService.updateOferta(id, req.body, await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma sin cuerpo el retiro de una oferta cuya preparación permite eliminarla.
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await ofertasService.deleteOferta(id, await resolverAlcanceCarrera(req.user));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
