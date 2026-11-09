import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { resultadosHorariosService } from "../services/resultados-horarios.service.js";
import { BadRequestError } from "../utils/errors.js";

export const resultadosHorariosController = {
  async descartar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.descartar(Number(req.params.id), req.body.revision, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  async exportarSalas(req: Request, res: Response, siguiente: NextFunction) {
    try {
      const archivo = await resultadosHorariosService.exportarSalas(Number(req.params.id), req.query.soloPendientes as unknown as boolean,
        req.user!, await resolverAlcanceCarrera(req.user));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${archivo.nombreArchivo}"`);
      res.send(archivo.buffer);
    } catch (error) { siguiente(error); }
  },
  async importarSalas(req: Request, res: Response, siguiente: NextFunction) {
    try {
      if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx")) throw new BadRequestError("Adjunte un archivo .xlsx en el campo archivo.");
      const resultado = await resultadosHorariosService.importarSalas(Number(req.params.id), req.body.revision, req.file.buffer,
        req.user!, await resolverAlcanceCarrera(req.user));
      if (resultado.errores.length) res.status(400).json({ status: "error", errores: resultado.errores });
      else res.json({ status: "success", data: resultado });
    } catch (error) { siguiente(error); }
  },
  async consultar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.consultar(Number(req.params.id), await resolverAlcanceCarrera(req.user), req.query.semestreMalla as unknown as number | undefined) }); }
    catch (error) { siguiente(error); }
  },
  async validarMovimiento(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.validarMovimiento(Number(req.params.id), req.body, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  async mover(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.mover(Number(req.params.id), req.body, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  async validarPublicacion(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.validarPublicacion(Number(req.params.id), await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  async publicar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.publicar(Number(req.params.id), req.body.revision, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
};
