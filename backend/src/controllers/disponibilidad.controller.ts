import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { disponibilidadService } from "../services/disponibilidad.service.js";
import { miDisponibilidadService } from "../services/mi-disponibilidad.service.js";
import { seguimientoDisponibilidadService } from "../services/seguimiento-disponibilidad.service.js";

export const disponibilidadController = {
  // Responde con el seguimiento de disponibilidad docente del período autorizado.
  async getSeguimiento(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await seguimientoDisponibilidadService.get(Number(req.query.planificacionSemestreId), req.user!, await resolverAlcanceCarrera(req.user));
      res.status(200).json({ status: "success", data });
    } catch (error) { next(error); }
  },
  // Presenta el contexto y la selección propia del profesor autenticado.
  async getMiDisponibilidad(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.query.planificacionSemestreId === undefined ? undefined : Number(req.query.planificacionSemestreId);
      const data = await miDisponibilidadService.get(req.user!, id);
      res.status(200).json({ status: "success", data });
    } catch (error) { next(error); }
  },
  // Devuelve la selección propia confirmada tras validar el envío completo de la grilla.
  async guardarMiDisponibilidad(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resultado = await miDisponibilidadService.modificar(req.user!, req.body.planificacionSemestreId, { bloquesIds: req.body.bloquesIds });
      res.status(200).json({ status: "success", data: resultado.seleccion });
    } catch (error) { next(error); }
  },
  // Consulta disponibilidad con identidad y alcance para aplicar las restricciones del servicio.
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await disponibilidadService.getDisponibilidad(req.query as any, await resolverAlcanceCarrera(req.user), req.user);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Presenta una disponibilidad individual accesible según propiedad y carrera.
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await disponibilidadService.getById(id, await resolverAlcanceCarrera(req.user), req.user);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Deriva el alta individual a los controles de propiedad y edición del servicio.
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await disponibilidadService.createSingle(req.body, await resolverAlcanceCarrera(req.user), req.user);
      res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Confirma la sincronización de la grilla que el servicio permite modificar.
  async sync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await disponibilidadService.syncGrid(req.body, await resolverAlcanceCarrera(req.user), req.user);
      res.status(200).json({
        status: "success",
        message: "Disponibilidad horaria sincronizada con éxito",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // Solicita retirar una disponibilidad individual sin omitir los controles de propiedad.
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await disponibilidadService.deleteSingle(id, await resolverAlcanceCarrera(req.user), req.user);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  // Solicita vaciar la grilla del profesor y período, respetando sus restricciones de edición.
  async clear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profesorId = Number(req.params.profesorId);
      const planificacionSemestreId = Number(req.params.planificacionSemestreId);
      await disponibilidadService.clearGrid(profesorId, planificacionSemestreId, await resolverAlcanceCarrera(req.user), req.user);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
