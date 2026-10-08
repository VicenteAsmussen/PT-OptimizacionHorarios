import type { Request, Response, NextFunction } from "express";
import { horariosService } from "../services/horarios.service.js";
import { excelSalasQueryValidation, type HorarioQueryDTO, type MiHorarioQueryDTO, type ExcelSalasQueryDTO } from "../validations/horarios.validation.js";

export const horariosController = {
  async importarExcelSalas(req: Request, res: Response, next: NextFunction): Promise<void> {
    const consulta = excelSalasQueryValidation.safeParse(req.query);
    if (!consulta.success) {
      res.status(400).json({ status: "error", errores: consulta.error.issues.map((problema) => ({ fila: 1, columna: "semestreId", mensaje: problema.message })) });
      return;
    }
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx")) {
      res.status(400).json({ status: "error", errores: [{ fila: 1, columna: "archivo", mensaje: "Adjunte un archivo .xlsx en el campo archivo." }] });
      return;
    }
    try {
      const resultado = await horariosService.importarExcelSalas(consulta.data.semestreId, req.file.buffer, { id: req.user!.id, rol: req.user!.rol });
      if (resultado.errores.length) res.status(400).json({ status: "error", errores: resultado.errores });
      else res.status(200).json({ status: "success", data: resultado });
    } catch (error) { next(error); }
  },

  async exportarExcelSalas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { semestreId } = req.query as unknown as ExcelSalasQueryDTO;
      const { buffer, nombreArchivo } = await horariosService.exportarExcelSalas(semestreId, { id: req.user!.id, rol: req.user!.rol });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  },

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
