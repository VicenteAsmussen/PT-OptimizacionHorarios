import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { planificacionesSemestresRouter } from "../src/routes/planificaciones-semestres.routes.js";
import { planificacionesSemestresRepository } from "../src/repositories/planificaciones-semestres.repository.js";

vi.mock("../src/repositories/planificaciones-semestres.repository.js", () => ({ planificacionesSemestresRepository: {
  findAll: vi.fn(), findById: vi.fn(), findProfesorByUsuarioId: vi.fn(), profesorAutorizado: vi.fn(), create: vi.fn(), update: vi.fn(),
} }));
vi.mock("../src/utils/alcance-carrera.js", async importar => {
  const original = await importar<typeof import("../src/utils/alcance-carrera.js")>();
  return { ...original, resolverAlcanceCarrera: async (usuario: { rol: string }) => usuario.rol === "secretaria" ? { carreraId: 1 } : undefined };
});
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: Request, res: Response, next: NextFunction) => {
  const rol = req.header("x-rol");
  if (!rol) { res.sendStatus(401); return; }
  req.user = { id: 5, rol } as Request["user"];
  next();
} }));
const app = express();
app.use(express.json());
app.use("/api/planificaciones-semestres", planificacionesSemestresRouter);
app.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => res.sendStatus(error.statusCode ?? 500));
const planificacion = { id: 7, carreraId: 1, codigo: "2026-2", anio: 2026, actual: true, estadoPlanificacion: "preparacion", carrera: { id: 1, nombre: "Carrera A" } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(planificacionesSemestresRepository.findAll).mockResolvedValue([planificacion] as never);
  vi.mocked(planificacionesSemestresRepository.findById).mockResolvedValue(planificacion as never);
  vi.mocked(planificacionesSemestresRepository.findProfesorByUsuarioId).mockResolvedValue({ id: 3, departamentoId: 4 });
  vi.mocked(planificacionesSemestresRepository.profesorAutorizado).mockResolvedValue(true);
  vi.mocked(planificacionesSemestresRepository.create).mockResolvedValue(planificacion as never);
  vi.mocked(planificacionesSemestresRepository.update).mockResolvedValue(planificacion as never);
});
describe("Planificaciones semestre HTTP (offline; reemplazo de semestres)", () => {
  it("profesor puede listar períodos autorizados con estado actual", async () => {
    const respuesta = await request(app).get("/api/planificaciones-semestres").set("x-rol", "profesor");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data[0]).toMatchObject({ actual: true, estadoPlanificacion: "preparacion" });
    expect(planificacionesSemestresRepository.findAll).toHaveBeenCalledWith(undefined, 5);
  });
  it("secretaria lista solo su carrera y no puede seleccionar otra", async () => {
    expect((await request(app).get("/api/planificaciones-semestres").set("x-rol", "secretaria")).status).toBe(200);
    expect(planificacionesSemestresRepository.findAll).toHaveBeenCalledWith(1, undefined);
    expect((await request(app).get("/api/planificaciones-semestres?carreraId=2").set("x-rol", "secretaria")).status).toBe(403);
  });
  it("admin puede listar todas las carreras sin una elección implícita", async () => {
    expect((await request(app).get("/api/planificaciones-semestres").set("x-rol", "admin")).status).toBe(200);
    expect(planificacionesSemestresRepository.findAll).toHaveBeenCalledWith(undefined, undefined);
  });
  it("secretaria puede activar un período de su carrera con PATCH", async () => {
    const respuesta = await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "secretaria").send({ actual: true });
    expect(respuesta.status).toBe(200);
    expect(planificacionesSemestresRepository.update).toHaveBeenCalledWith(7, 1, { actual: true });
  });
  it("profesor no puede activar ni crear períodos", async () => {
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "profesor").send({ actual: true })).status).toBe(403);
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "profesor").send({ carreraId: 1, codigo: "2027-1", anio: 2027 })).status).toBe(403);
  });
  it("crea período vacío y actualiza codigo sin desactivar actual ni publicar entradas", async () => {
    const nueva = await request(app).post("/api/planificaciones-semestres").set("x-rol", "secretaria").send({ carreraId: 1, codigo: "2027-1", anio: 2027 });
    expect(nueva.status).toBe(201);
    expect(nueva.body.data).not.toHaveProperty("horarioPublicado");
    expect(nueva.body.data.anio).toBe(2026);
    expect(planificacionesSemestresRepository.create).toHaveBeenCalledWith({ carreraId: 1, codigo: "2027-1", anio: 2027, actual: false });
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "secretaria").send({ codigo: "2028-1" })).status).toBe(200);
    expect(planificacionesSemestresRepository.update).toHaveBeenCalledWith(7, 1, { codigo: "2028-1" });
  });
  it.each([2000, 2026, 2100])("acepta anio %s en POST y PATCH", async anio => {
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "Periodo libre", anio })).status).toBe(201);
    expect(planificacionesSemestresRepository.create).toHaveBeenCalledWith({ carreraId: 1, codigo: "Periodo libre", anio, actual: false });
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ anio })).status).toBe(200);
    expect(planificacionesSemestresRepository.update).toHaveBeenCalledWith(7, 1, { anio });
  });
  it.each([1999, 2101, 2026.5, "2026", null])("rechaza anio invalido %j en POST y PATCH", async anio => {
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2026-1", anio })).status).toBe(400);
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ anio })).status).toBe(400);
    expect(planificacionesSemestresRepository.create).not.toHaveBeenCalled();
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
  it("requiere anio al crear y limita codigo a varchar20", async () => {
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2026-1" })).status).toBe(400);
    for (const codigo of ["", "x".repeat(21)]) {
      expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo, anio: 2026 })).status).toBe(400);
      expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ codigo })).status).toBe(400);
    }
    expect(planificacionesSemestresRepository.create).not.toHaveBeenCalled();
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
  it("no permite transferir carrera ni escribir estado mediante PATCH", async () => {
    for (const datos of [{ carreraId: 2 }, { estadoPlanificacion: "publicado" }, { estadoPlanificacion: "preparacion" }]) {
      expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send(datos)).status).toBe(400);
    }
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
  it("secretaria no puede leer/modificar planificación ajena con mismo código", async () => {
    vi.mocked(planificacionesSemestresRepository.findById).mockResolvedValue({ ...planificacion, carreraId: 2 } as never);
    expect((await request(app).get("/api/planificaciones-semestres/7").set("x-rol", "secretaria")).status).toBe(404);
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "secretaria").send({ codigo: "2028-1" })).status).toBe(404);
  });
  it("profesor sin relación de carrera no puede consultar el período", async () => {
    vi.mocked(planificacionesSemestresRepository.profesorAutorizado).mockResolvedValue(false);
    expect((await request(app).get("/api/planificaciones-semestres/7").set("x-rol", "profesor")).status).toBe(403);
  });
  it.each(["propuesta", "publicado"])("PATCH no modifica planificación %s", async estadoPlanificacion => {
    vi.mocked(planificacionesSemestresRepository.findById).mockResolvedValue({ ...planificacion, estadoPlanificacion } as never);
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ codigo: "2028-1" })).status).toBe(403);
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
});
