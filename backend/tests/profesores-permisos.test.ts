import { beforeEach, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { profesoresRouter } from "../src/routes/profesores.routes.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { carrerasRepository } from "../src/repositories/carreras.repository.js";

vi.mock("../src/repositories/carreras.repository.js", () => ({ carrerasRepository: { findAlcanceByUsuarioId: vi.fn() } }));
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: { findByCorreo: vi.fn() } }));
vi.mock("../src/repositories/profesores.repository.js", () => ({ profesoresRepository: {
  findAll: vi.fn(), findById: vi.fn(), findByRut: vi.fn(), findByUsuarioId: vi.fn(), checkDepartamentoExists: vi.fn(),
  checkUsuarioExists: vi.fn(), create: vi.fn(), delete: vi.fn(), hasHorarios: vi.fn(), deleteWithDependencias: vi.fn(),
} }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: Request, _res: Response, next: NextFunction) => {
  req.user = { id: 1, nombre: "Secretaría", correo: "secretaria@ubiobio.cl", rol: req.header("x-rol") ?? "secretaria" } as Request["user"]; next();
} }));

const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/profesores", profesoresRouter);
aplicacion.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.sendStatus(error.statusCode ?? 500);
});

const alcance = {
  carreraId: 1,
  asignaturasCodigos: [],
  departamentosIds: [4, 5],
  departamentosGestionadosIds: [4],
  profesoresIds: [7, 8],
  ofertasIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(alcance);
  vi.mocked(profesoresRepository.findAll).mockResolvedValue([]);
  vi.mocked(profesoresRepository.findById).mockResolvedValue({ id: 7, departamentoId: 4, tipo: "part time", usuarioId: null } as never);
  vi.mocked(profesoresRepository.findByRut).mockResolvedValue(undefined);
  vi.mocked(profesoresRepository.findByUsuarioId).mockResolvedValue(undefined as never);
  vi.mocked(profesoresRepository.checkDepartamentoExists).mockResolvedValue(true);
  vi.mocked(profesoresRepository.checkUsuarioExists).mockResolvedValue(true);
  vi.mocked(profesoresRepository.create).mockResolvedValue({ id: 9, departamentoId: 5, tipo: "part time" } as never);
  vi.mocked(profesoresRepository.hasHorarios).mockResolvedValue(false);
});

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
  expect((await request(aplicacion).get("/profesores?departamentoId=6")).status).toBe(403);
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(undefined);
  expect((await request(aplicacion).get("/profesores")).status).toBe(403);
  expect(profesoresRepository.findAll).not.toHaveBeenCalled();
});

it("admin lista globalmente sin consultar perfil secretaria", async () => {
  expect((await request(aplicacion).get("/profesores?departamentoId=6").set("x-rol", "admin")).status).toBe(200);
  expect(profesoresRepository.findAll).toHaveBeenCalledWith(6, undefined);
  expect(carrerasRepository.findAlcanceByUsuarioId).not.toHaveBeenCalled();
});

it("rechaza filtro inválido", async () => {
  expect((await request(aplicacion).get("/profesores?departamentoId=0")).status).toBe(400);
  expect(profesoresRepository.findAll).not.toHaveBeenCalled();
});

it("secretaria crea profesor part time en departamento externo dentro de alcance", async () => {
  const respuesta = await request(aplicacion).post("/profesores").send({ nombre: "Profesor externo", rut: "12345678-5", departamentoId: 5, tipo: "part time" });
  expect(respuesta.status).toBe(201);
  expect(profesoresRepository.create).toHaveBeenCalledWith({ nombre: "Profesor externo", rut: "12345678-5", departamentoId: 5, tipo: "part time" });
});

it("secretaria no puede crear profesor planta", async () => {
  const respuesta = await request(aplicacion).post("/profesores").send({ nombre: "Profesor planta", rut: "12345678-5", departamentoId: 4, tipo: "planta" });
  expect(respuesta.status).toBe(403);
  expect(profesoresRepository.create).not.toHaveBeenCalled();
});

it("secretaria elimina profesor part time sin horarios y bloquea eliminación con horarios", async () => {
  expect((await request(aplicacion).delete("/profesores/7")).status).toBe(204);
  expect(profesoresRepository.deleteWithDependencias).toHaveBeenCalledWith(7, null);

  vi.mocked(profesoresRepository.hasHorarios).mockResolvedValue(true);
  expect((await request(aplicacion).delete("/profesores/7")).status).toBe(409);
});

it("secretaria no puede eliminar profesor planta y admin puede eliminar según reglas generales", async () => {
  vi.mocked(profesoresRepository.findById).mockResolvedValue({ id: 7, departamentoId: 4, tipo: "planta", usuarioId: null } as never);
  expect((await request(aplicacion).delete("/profesores/7")).status).toBe(403);
  expect(profesoresRepository.deleteWithDependencias).not.toHaveBeenCalled();

  expect((await request(aplicacion).delete("/profesores/7").set("x-rol", "admin")).status).toBe(204);
  expect(profesoresRepository.deleteWithDependencias).toHaveBeenCalledWith(7, null);
});
