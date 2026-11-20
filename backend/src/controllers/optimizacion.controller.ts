import type { Request, Response, NextFunction } from "express";
import { optimizacionService } from "../services/optimizacion.service.js";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";

export const optimizacionController = {
  // Presenta los bloqueos y recursos que deben revisarse antes de iniciar el modelo.
  async preparar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await optimizacionService.preparar(Number(req.params.id), await resolverAlcanceCarrera(req.user)) }); } catch (error) { siguiente(error); }
  },
  // Acepta el seguimiento asíncrono del intento sin afirmar que ya exista una propuesta.
  async iniciar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.status(202).json({ status: "success", data: await optimizacionService.iniciar(Number(req.params.id), req.body, await resolverAlcanceCarrera(req.user)) }); } catch (error) { siguiente(error); }
  },
  // Responde con el estado y diagnóstico visible de una ejecución autorizada.
  async consultar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await optimizacionService.consultar(String(req.params.id), await resolverAlcanceCarrera(req.user)) }); } catch (error) { siguiente(error); }
  },
  // Presenta el último intento del período sin disparar una nueva generación.
  async ultima(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await optimizacionService.ultima(Number(req.params.id), await resolverAlcanceCarrera(req.user)) }); } catch (error) { siguiente(error); }
  },
};
