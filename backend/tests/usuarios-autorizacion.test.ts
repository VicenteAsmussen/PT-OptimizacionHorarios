import { beforeEach, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { usuariosRouter } from "../src/routes/usuarios.routes.js";
import { profesoresRouter } from "../src/routes/profesores.routes.js";
import { usuariosRepository } from "../src/repositories/usuarios.repository.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { carrerasRepository } from "../src/repositories/carreras.repository.js";

vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: {
  findAll: vi.fn(), findById: vi.fn(), findByCorreo: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
} }));
vi.mock("../src/repositories/profesores.repository.js", () => ({ profesoresRepository: {
  findById: vi.fn(), findByRut: vi.fn(), findByUsuarioId: vi.fn(), checkDepartamentoExists: vi.fn(),
  checkUsuarioExists: vi.fn(), create: vi.fn(), createWithUsuario: vi.fn(), updateWithSyncedUsuarioName: vi.fn(),
  createUsuarioForProfesor: vi.fn(), updateUsuarioForProfesor: vi.fn(), deleteUsuarioForProfesor: vi.fn(),
  deleteWithDependencias: vi.fn(), hasHorarios: vi.fn(),
} }));
vi.mock("../src/repositories/carreras.repository.js", () => ({ carrerasRepository: { findAlcanceByUsuarioId: vi.fn() } }));
vi.mock("../src/utils/password.js", () => ({ hashPassword: vi.fn(async () => "hash-sintetico") }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate(req: Request, _res: Response, next: NextFunction) {
  req.user = { id: 1, nombre: "Actor", correo: "actor@example.test", rol: req.header("x-rol") ?? "secretaria" } as Request["user"];
  next();
} }));

const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/usuarios", usuariosRouter);
aplicacion.use("/profesores", profesoresRouter);
aplicacion.use((error: { statusCode?: number; message?: string }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error.statusCode ?? 500).json({ message: error.message });
});

const alcance = { carreraId: 1, departamentosIds: [4, 5], departamentosGestionadosIds: [4], profesoresIds: [7], asignaturasCodigos: [], ofertasIds: [] };
const cuenta = { id: 20, nombre: "Profesor", correo: "profesor@example.test", rol: "profesor", clave: "hash-sintetico", versionSesion: 0 };
let profesor: { id: number; nombre: string; departamentoId: number; tipo: string; usuarioId: number | null; usuario?: typeof cuenta };

beforeEach(() => {
  vi.resetAllMocks();
  profesor = { id: 7, nombre: "Profesor", departamentoId: 4, tipo: "part time", usuarioId: 20, usuario: { ...cuenta } };
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(alcance);
  vi.mocked(usuariosRepository.findAll).mockResolvedValue([cuenta] as never);
  vi.mocked(usuariosRepository.findById).mockImplementation(async () => ({ ...cuenta, ...profesor.usuario }) as never);
  vi.mocked(usuariosRepository.findByCorreo).mockResolvedValue(undefined);
  vi.mocked(usuariosRepository.create).mockResolvedValue(cuenta as never);
  vi.mocked(usuariosRepository.delete).mockResolvedValue(true);
  vi.mocked(profesoresRepository.findById).mockImplementation(async () => ({ ...profesor }) as never);
  vi.mocked(profesoresRepository.findByRut).mockResolvedValue(undefined);
  vi.mocked(profesoresRepository.findByUsuarioId).mockResolvedValue(undefined);
  vi.mocked(profesoresRepository.checkDepartamentoExists).mockResolvedValue(true);
  vi.mocked(profesoresRepository.checkUsuarioExists).mockResolvedValue(true);
  vi.mocked(profesoresRepository.create).mockResolvedValue({ id: 7 } as never);
  vi.mocked(profesoresRepository.hasHorarios).mockResolvedValue(false);
});

it.each(["secretaria", "profesor"])("%s no administra cuentas por el CRUD general", async (rol) => {
  const respuestas = await Promise.all([
    request(aplicacion).get("/usuarios").set("x-rol", rol),
    request(aplicacion).get("/usuarios/20").set("x-rol", rol),
    request(aplicacion).post("/usuarios").set("x-rol", rol).send({ nombre: "Intruso", correo: "intruso@example.test", clave: "Clave123!", rol: "admin" }),
    request(aplicacion).put("/usuarios/20").set("x-rol", rol).send({ rol: "admin" }),
    request(aplicacion).delete("/usuarios/20").set("x-rol", rol),
  ]);
  expect(respuestas.map(respuesta => respuesta.status)).toEqual([403, 403, 403, 403, 403]);
  for (const operacion of Object.values(usuariosRepository)) expect(operacion).not.toHaveBeenCalled();
});

it("admin conserva lectura, creación, edición y eliminación generales sin revelar credenciales internas", async () => {
  const listado = await request(aplicacion).get("/usuarios").set("x-rol", "admin");
  expect(listado.status).toBe(200);
  expect(listado.body.data[0]).not.toHaveProperty("clave");
  expect(listado.body.data[0]).not.toHaveProperty("versionSesion");
  expect((await request(aplicacion).get("/usuarios/20").set("x-rol", "admin")).status).toBe(200);
  expect((await request(aplicacion).post("/usuarios").set("x-rol", "admin").send({ nombre: "Otro", correo: "otro@example.test", clave: "Clave123!", rol: "admin" })).status).toBe(201);
  expect((await request(aplicacion).put("/usuarios/20").set("x-rol", "admin").send({ nombre: "Actualizado" })).status).toBe(200);
  expect((await request(aplicacion).delete("/usuarios/20").set("x-rol", "admin")).status).toBe(204);
  expect(usuariosRepository.update).toHaveBeenCalledWith(20, { nombre: "Actualizado" }, undefined);
  expect(usuariosRepository.delete).toHaveBeenCalledWith(20);
});

it("secretaría conserva edición y retirada del acceso part time gestionado", async () => {
  expect((await request(aplicacion).put("/profesores/7/usuario").send({ correo: "nuevo@example.test" })).status).toBe(200);
  expect(profesoresRepository.updateUsuarioForProfesor).toHaveBeenCalledWith(20, { nombre: "Profesor", correo: "nuevo@example.test", clave: undefined }, true);
  expect((await request(aplicacion).delete("/profesores/7/usuario")).status).toBe(204);
  expect(profesoresRepository.deleteUsuarioForProfesor).toHaveBeenCalledWith(7, 20, true);
});

it("secretaría conserva creación de acceso part time con rol fijo profesor", async () => {
  profesor.usuarioId = null;
  delete profesor.usuario;
  expect((await request(aplicacion).post("/profesores/7/usuario").send({ correo: "nuevo@example.test", clave: "Clave123!" })).status).toBe(201);
  expect(profesoresRepository.createUsuarioForProfesor).toHaveBeenCalledWith(7, expect.objectContaining({ rol: "profesor", correo: "nuevo@example.test" }));
});

it.each(["admin", "secretaria"])("secretaría no modifica ni elimina una cuenta %s vinculada a un profesor", async (rol) => {
  profesor.usuario!.rol = rol;
  const respuestas = await Promise.all([
    request(aplicacion).put("/profesores/7/usuario").send({ correo: "ocupado@example.test" }),
    request(aplicacion).delete("/profesores/7/usuario"),
    request(aplicacion).put("/profesores/7").send({ nombre: "Otro nombre" }),
    request(aplicacion).delete("/profesores/7"),
  ]);
  expect(respuestas.map(respuesta => respuesta.status)).toEqual([403, 403, 403, 403]);
  expect(profesoresRepository.updateUsuarioForProfesor).not.toHaveBeenCalled();
  expect(profesoresRepository.deleteUsuarioForProfesor).not.toHaveBeenCalled();
  expect(profesoresRepository.updateWithSyncedUsuarioName).not.toHaveBeenCalled();
  expect(profesoresRepository.deleteWithDependencias).not.toHaveBeenCalled();
});

it("secretaría no vincula cuentas arbitrarias para modificar sus credenciales después", async () => {
  profesor.usuarioId = null;
  delete profesor.usuario;
  expect((await request(aplicacion).post("/profesores").send({ nombre: "Profesor", rut: "12345678-5", tipo: "part time", departamentoId: 4, usuarioId: 90 })).status).toBe(403);
  expect((await request(aplicacion).put("/profesores/7").send({ usuarioId: 90 })).status).toBe(403);
  expect(profesoresRepository.create).not.toHaveBeenCalled();
  expect(profesoresRepository.updateWithSyncedUsuarioName).not.toHaveBeenCalled();
});

it("secretaría no usa cambio de tipo para modificar un profesor planta", async () => {
  profesor.tipo = "planta";
  expect((await request(aplicacion).put("/profesores/7").send({ tipo: "part time" })).status).toBe(403);
  expect(profesoresRepository.updateWithSyncedUsuarioName).not.toHaveBeenCalled();
});

it("secretaría no cambia ni borra cuentas desde un departamento externo consultable", async () => {
  profesor.departamentoId = 5;
  expect((await request(aplicacion).put("/profesores/7").send({ nombre: "Nombre nuevo" })).status).toBe(403);
  expect((await request(aplicacion).delete("/profesores/7")).status).toBe(403);
  expect(profesoresRepository.updateWithSyncedUsuarioName).not.toHaveBeenCalled();
  expect(profesoresRepository.deleteWithDependencias).not.toHaveBeenCalled();
});
