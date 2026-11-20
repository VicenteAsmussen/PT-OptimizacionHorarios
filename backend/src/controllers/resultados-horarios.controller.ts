import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { resultadosHorariosService } from "../services/resultados-horarios.service.js";
import { BadRequestError } from "../utils/errors.js";

export const resultadosHorariosController = {
  // Solicita retirar la revisión consultada de la propuesta gestionada.
  async descartar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.descartar(Number(req.params.id), req.body.revision, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  // Descarga las sesiones exportables del resultado para completar sus salas externamente.
  async exportarSalas(req: Request, res: Response, siguiente: NextFunction) {
    try {
      const archivo = await resultadosHorariosService.exportarSalas(Number(req.params.id), req.query.soloPendientes as unknown as boolean,
        req.user!, await resolverAlcanceCarrera(req.user));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${archivo.nombreArchivo}"`);
      res.send(archivo.buffer);
    } catch (error) { siguiente(error); }
  },
  // Recibe salas para la revisión indicada y distingue rechazos del archivo de cambios confirmados.
  async importarSalas(req: Request, res: Response, siguiente: NextFunction) {
    try {
      if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx")) throw new BadRequestError("Adjunte un archivo .xlsx en el campo archivo.");
      const resultado = await resultadosHorariosService.importarSalas(Number(req.params.id), req.body.revision, req.file.buffer,
        req.user!, await resolverAlcanceCarrera(req.user));
      if (resultado.errores.length) res.status(400).json({ status: "error", errores: resultado.errores });
      else res.json({ status: "success", data: resultado });
    } catch (error) { siguiente(error); }
  },
  // Presenta el resultado accesible y el filtro de semestre de malla solicitado.
  async consultar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.consultar(Number(req.params.id), await resolverAlcanceCarrera(req.user), req.query.semestreMalla as unknown as number | undefined) }); }
    catch (error) { siguiente(error); }
  },
  // Responde con la evaluación del movimiento sin confirmar su persistencia.
  async validarMovimiento(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.validarMovimiento(Number(req.params.id), req.body, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  // Confirma el movimiento revalidado sobre la propuesta vigente de la carrera.
  async mover(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.mover(Number(req.params.id), req.body, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  // Expone los impedimentos de publicación sin cambiar el estado del resultado.
  async validarPublicacion(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.validarPublicacion(Number(req.params.id), await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
  // Solicita publicar la revisión indicada y presenta el resultado si supera los controles.
  async publicar(req: Request, res: Response, siguiente: NextFunction) {
    try { res.json({ status: "success", data: await resultadosHorariosService.publicar(Number(req.params.id), req.body.revision, await resolverAlcanceCarrera(req.user)) }); }
    catch (error) { siguiente(error); }
  },
};
