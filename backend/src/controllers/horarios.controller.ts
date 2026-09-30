import type { Request, Response, NextFunction } from "express";
import { horariosService } from "../services/horarios.service.js";
import { type HorarioQueryDTO, type MiHorarioQueryDTO } from "../validations/horarios.validation.js";

export const horariosController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await horariosService.getAllHorarios(req.query as unknown as HorarioQueryDTO);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMiHorario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await horariosService.getMiHorario(
        req.user!.id,
        req.query as unknown as MiHorarioQueryDTO
      );
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
      const data = await horariosService.getHorarioById(id);
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
      const data = await horariosService.createHorario(req.body);
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
      const data = await horariosService.updateHorario(id, req.body);
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
      const id = Number(req.params.id);
      await horariosService.deleteHorario(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async deleteByOferta(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ofertaId = Number(req.params.ofertaId);
      const count = await horariosService.deleteHorariosByOferta(ofertaId);
      res.status(200).json({
        status: "success",
        message: `Se eliminaron ${count} asignaciones de horario para la oferta ${ofertaId}`,
      });
    } catch (error) {
      next(error);
    }
  },
};
