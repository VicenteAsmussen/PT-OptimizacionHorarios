import type { Request, Response, NextFunction } from "express";
import { administracionPeriodosService as servicio } from "../services/administracion-periodos.service.js";
import type { AlcanceReinicio } from "../validations/administracion-periodos.validation.js";

export const administracionPeriodosController = {
  async resumen(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await servicio.resumen(Number(req.params.id), req.query.alcance as AlcanceReinicio);
      res.setHeader("Cache-Control", "no-store");
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  async reiniciar(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await servicio.reiniciar(Number(req.params.id), req.body);
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
  async cambiarEstado(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await servicio.cambiarEstado(Number(req.params.id), req.body);
      res.json({ status: "success", data });
    } catch (error) { next(error); }
  },
};
