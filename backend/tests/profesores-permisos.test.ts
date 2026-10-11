import { beforeEach, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { profesoresRouter } from "../src/routes/profesores.routes.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { carrerasRepository } from "../src/repositories/carreras.repository.js";
vi.mock("../src/repositories/carreras.repository.js", () => ({ carrerasRepository: { findAlcanceByUsuarioId: vi.fn() } }));
vi.mock("../src/repositories/profesores.repository.js", () => ({ profesoresRepository: { findAll: vi.fn(), findById: vi.fn(), delete: vi.fn() } }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: Request, _res: Response, next: NextFunction) => {
  req.user = { id: 1, rol: req.header("x-rol") ?? "secretaria" } as Request["user"]; next();
} }));
const aplicacion = express(); aplicacion.use("/profesores", profesoresRouter);
aplicacion.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.sendStatus(error.statusCode ?? 500);
});
const alcance = { carreraId: 1, asignaturasCodigos: [], departamentosIds: [4], profesoresIds: [7], ofertasIds: [] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(alcance); vi.mocked(profesoresRepository.findAll).mockResolvedValue([]); vi.mocked(profesoresRepository.findById).mockResolvedValue({ id: 7 } as never); });
it("secretaria puede listar profesores del departamento", async () => {
  expect((await request(aplicacion).get("/profesores?departamentoId=4")).status).toBe(200);
  expect(profesoresRepository.findAll).toHaveBeenCalledWith(4, alcance);
  expect(carrerasRepository.findAlcanceByUsuarioId).toHaveBeenCalledWith(1);
});
it("ignora carreraId suministrada por cliente y mantiene alcance autenticado", async () => {
  expect((await request(aplicacion).get("/profesores?carreraId=2")).status).toBe(200);
  expect(profesoresRepository.findAll).toHaveBeenCalledWith(undefined, alcance);
});
it("rechaza departamento ajeno y perfil ausente", async () => {
  expect((await request(aplicacion).get("/profesores?departamentoId=5")).status).toBe(403);
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(undefined);
  expect((await request(aplicacion).get("/profesores")).status).toBe(403);
  expect(profesoresRepository.findAll).not.toHaveBeenCalled();
});
it("admin lista globalmente sin consultar perfil secretaria", async () => {
  expect((await request(aplicacion).get("/profesores?departamentoId=5").set("x-rol", "admin")).status).toBe(200);
  expect(profesoresRepository.findAll).toHaveBeenCalledWith(5, undefined);
  expect(carrerasRepository.findAlcanceByUsuarioId).not.toHaveBeenCalled();
});
it("rechaza filtro inválido", async () => {
  expect((await request(aplicacion).get("/profesores?departamentoId=0")).status).toBe(400);
  expect(profesoresRepository.findAll).not.toHaveBeenCalled();
});
it("secretaria no puede eliminar y admin sí", async () => {
  expect((await request(aplicacion).delete("/profesores/7")).status).toBe(403);
  expect(profesoresRepository.delete).not.toHaveBeenCalled();
  expect((await request(aplicacion).delete("/profesores/7").set("x-rol", "admin")).status).toBe(204);
  expect(profesoresRepository.delete).toHaveBeenCalledWith(7);
});
