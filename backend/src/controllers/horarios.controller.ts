import type { Request, Response, NextFunction } from "express";
import { resolverAlcanceCarrera } from "../utils/alcance-carrera.js";
import { horariosService } from "../services/horarios.service.js";
import { excelExternosQueryValidation, excelSalasQueryValidation, type HorarioQueryDTO, type MiHorarioQueryDTO, type ExcelSalasQueryDTO } from "../validations/horarios.validation.js";

export const horariosController = {
  async importarExcelExternos(req: Request, res: Response, next: NextFunction): Promise<void> {
    const consulta = excelExternosQueryValidation.safeParse(req.query);
    if (!consulta.success) {
      res.status(400).json({ status: "error", errores: consulta.error.issues.map((problema) => ({ fila: 1, columna: String(problema.path[0]), mensaje: problema.message })) });
      return;
    }
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx")) {
      res.status(400).json({ status: "error", errores: [{ fila: 1, columna: "archivo", mensaje: "Adjunte un archivo .xlsx en el campo archivo." }] });
      return;
    }
    try {
      const resultado = await horariosService.importarExcelExternos(consulta.data.planificacionSemestreId, consulta.data.departamentoId, req.file.buffer, { id: req.user!.id, rol: req.user!.rol });
      if (resultado.errores.length) res.status(400).json({ status: "error", errores: resultado.errores });
      else res.status(201).json({ status: "success", data: resultado });
    } catch (error) { next(error); }
  },

  async importarExcelSalas(req: Request, res: Response, next: NextFunction): Promise<void> {
    const consulta = excelSalasQueryValidation.safeParse(req.query);
    if (!consulta.success) {
      res.status(400).json({ status: "error", errores: consulta.error.issues.map((problema) => ({ fila: 1, columna: "planificacionSemestreId", mensaje: problema.message })) });
      return;
    }
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx")) {
      res.status(400).json({ status: "error", errores: [{ fila: 1, columna: "archivo", mensaje: "Adjunte un archivo .xlsx en el campo archivo." }] });
      return;
    }
    try {
      const resultado = await horariosService.importarExcelSalas(consulta.data.planificacionSemestreId, req.file.buffer, { id: req.user!.id, rol: req.user!.rol });
      if (resultado.errores.length) res.status(400).json({ status: "error", errores: resultado.errores });
      else res.status(200).json({ status: "success", data: resultado });
    } catch (error) { next(error); }
  },

  async exportarExcelSalas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { planificacionSemestreId } = req.query as unknown as ExcelSalasQueryDTO;
      const { buffer, nombreArchivo } = await horariosService.exportarExcelSalas(planificacionSemestreId, { id: req.user!.id, rol: req.user!.rol });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  },

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await horariosService.getAllHorarios(req.query as unknown as HorarioQueryDTO, await resolverAlcanceCarrera(req.user));
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
      const data = await horariosService.getHorarioById(id, await resolverAlcanceCarrera(req.user));
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
      const data = await horariosService.createHorario(req.body, await resolverAlcanceCarrera(req.user));
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
      const data = await horariosService.updateHorario(id, req.body, await resolverAlcanceCarrera(req.user));
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
      await horariosService.deleteHorario(id, await resolverAlcanceCarrera(req.user));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async deleteByOferta(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ofertaId = Number(req.params.ofertaId);
      const count = await horariosService.deleteHorariosByOferta(ofertaId, await resolverAlcanceCarrera(req.user));
      res.status(200).json({
        status: "success",
        message: `Se eliminaron ${count} asignaciones de horario para la oferta ${ofertaId}`,
      });
    } catch (error) {
      next(error);
    }
  },
};
