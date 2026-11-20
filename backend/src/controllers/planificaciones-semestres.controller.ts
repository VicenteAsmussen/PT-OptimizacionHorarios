import type { Request, Response, NextFunction } from "express";
import { planificacionesSemestresService } from "../services/planificaciones-semestres.service.js";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";

export const planificacionesSemestresController = {
  // Lista los períodos visibles con la identidad y la carrera resueltas desde la solicitud.
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const carreraId = req.query.carreraId === undefined ? undefined : Number(req.query.carreraId);
      const data = await planificacionesSemestresService.getAll(carreraId, await resolverAlcanceCarrera(req.user), req.user);
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  // Devuelve el período solicitado tras validar el acceso académico del usuario.
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.getById(Number(req.params.id), await resolverAlcanceCarrera(req.user), req.user);
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  // Confirma la apertura del período actual en preparación.
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.create(req.body, await resolverAlcanceCarrera(req.user));
      res.status(201).json({ status: "success", data });
    } catch (error) { next(error); }
  },
  // Presenta el período después de aplicar sus cambios de mantenimiento permitidos.
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.update(Number(req.params.id), req.body, await resolverAlcanceCarrera(req.user));
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  // Transmite la confirmación de eliminación al servicio y devuelve su resultado.
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await planificacionesSemestresService.delete(Number(req.params.id), req.body.confirmacion, await resolverAlcanceCarrera(req.user));
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
};
