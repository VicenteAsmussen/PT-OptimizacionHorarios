import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { planificacionesSemestresRouter } from "../src/routes/planificaciones-semestres.routes.js";
import { planificacionesSemestresRepository } from "../src/repositories/planificaciones-semestres.repository.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { ConflictError, NotFoundError } from "../src/utils/errors.js";

vi.mock("../src/repositories/planificaciones-semestres.repository.js", () => ({ planificacionesSemestresRepository: {
  findAll: vi.fn(), findById: vi.fn(), findProfesorByUsuarioId: vi.fn(), profesorAutorizado: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
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
app.use(errorHandler);
const planificacion = { id: 7, carreraId: 1, codigo: "2026-2", actual: true, estadoPlanificacion: "preparacion", carrera: { id: 1, nombre: "Carrera A" } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(planificacionesSemestresRepository.findAll).mockResolvedValue([planificacion] as never);
  vi.mocked(planificacionesSemestresRepository.findById).mockResolvedValue(planificacion as never);
  vi.mocked(planificacionesSemestresRepository.findProfesorByUsuarioId).mockResolvedValue({ id: 3, departamentoId: 4 });
  vi.mocked(planificacionesSemestresRepository.profesorAutorizado).mockResolvedValue(true);
  vi.mocked(planificacionesSemestresRepository.create).mockImplementation(async datos => ({ id: 8, ...datos }) as never);
  vi.mocked(planificacionesSemestresRepository.update).mockResolvedValue(planificacion as never);
  vi.mocked(planificacionesSemestresRepository.delete).mockResolvedValue(planificacion as never);
});
describe("Planificaciones semestre HTTP (offline; reemplazo de semestres)", () => {
  it.each(["preparacion", "propuesta", "publicado"])("actual-only PATCH conserva estado %s", async estadoPlanificacion => {
    const fila = { ...planificacion, estadoPlanificacion };
    vi.mocked(planificacionesSemestresRepository.findById).mockResolvedValue(fila as never);
    vi.mocked(planificacionesSemestresRepository.update).mockResolvedValue(fila as never);
    for (const actual of [true, false]) {
      const respuesta = await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ actual });
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ status: "success", data: fila });
      expect(planificacionesSemestresRepository.update).toHaveBeenLastCalledWith(7, 1, { actual });
    }
  });
  it.each(["propuesta", "publicado"])("actual no autoriza renombrar %s", async estadoPlanificacion => {
    vi.mocked(planificacionesSemestresRepository.findById).mockResolvedValue({ ...planificacion, estadoPlanificacion } as never);
    const respuesta = await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ codigo: "2028-1", actual: true });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.message).toBe("La planificación ya tiene una propuesta o publicación");
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
  it("DELETE confirma el código exacto y delega sin eliminar ofertas", async () => {
    const respuesta = await request(app).delete("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ confirmacion: "2026-2" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "success", data: planificacion });
    expect(planificacionesSemestresRepository.delete).toHaveBeenCalledExactlyOnceWith(7, 1, "2026-2");
  });
  it.each([undefined, "secretaria", "profesor"])("DELETE rechaza rol %s antes de leer/escribir", async rol => {
    const solicitud = request(app).delete("/api/planificaciones-semestres/7").send({ confirmacion: "2026-2" });
    const respuesta = await (rol ? solicitud.set("x-rol", rol) : solicitud);
    expect(respuesta.status).toBe(rol ? 403 : 401);
    expect(planificacionesSemestresRepository.findById).not.toHaveBeenCalled();
    expect(planificacionesSemestresRepository.delete).not.toHaveBeenCalled();
  });
  it.each([{}, { confirmacion: "" }, { confirmacion: 2026 }, { confirmacion: "2026-2", alcance: "gestionadas" }])("DELETE valida cuerpo %j antes de escribir", async datos => {
    expect((await request(app).delete("/api/planificaciones-semestres/7").set("x-rol", "admin").send(datos)).status).toBe(400);
    expect(planificacionesSemestresRepository.delete).not.toHaveBeenCalled();
  });
  it("DELETE devuelve 404 sin delegar si no existe y valida id", async () => {
    vi.mocked(planificacionesSemestresRepository.findById).mockResolvedValue(undefined);
    const respuesta = await request(app).delete("/api/planificaciones-semestres/404").set("x-rol", "admin").send({ confirmacion: "2026-2" });
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.message).toBe("Planificación de semestre no encontrada");
    expect((await request(app).delete("/api/planificaciones-semestres/0").set("x-rol", "admin").send({ confirmacion: "2026-2" })).status).toBe(400);
    expect(planificacionesSemestresRepository.delete).not.toHaveBeenCalled();
  });
  it.each([
    "El código cambió o la confirmación no coincide. Consulta y confirma nuevamente el período",
    "Solo se puede eliminar un período en preparación",
    "Solo se puede eliminar un período sin ofertas de ningún departamento",
  ])("DELETE conserva conflicto transaccional: %s", async message => {
    vi.mocked(planificacionesSemestresRepository.delete).mockRejectedValue(new ConflictError(message));
    const respuesta = await request(app).delete("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ confirmacion: "2026-1" });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 409, message });
    expect(planificacionesSemestresRepository.delete).toHaveBeenCalledExactlyOnceWith(7, 1, "2026-1");
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
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
  it("secretaria no crea ni modifica código o actual, incluso en su carrera", async () => {
    const datos = { carreraId: 1, codigo: "2027-1" };
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "secretaria").send(datos)).status).toBe(403);
    for (const cambios of [{ actual: true }, { actual: false }, { codigo: "2028-1" }]) {
      expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "secretaria").send(cambios)).status).toBe(403);
    }
    expect(planificacionesSemestresRepository.create).not.toHaveBeenCalled();
    expect(planificacionesSemestresRepository.findById).not.toHaveBeenCalled();
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
  it("profesor no puede activar ni crear períodos", async () => {
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "profesor").send({ actual: true })).status).toBe(403);
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "profesor").send({ carreraId: 1, codigo: "2027-1" })).status).toBe(403);
  });
  it("crea período vacío y actualiza codigo sin desactivar actual ni publicar entradas", async () => {
    const nueva = await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2027-1" });
    expect(nueva.status).toBe(201);
    expect(nueva.body.data).toMatchObject({ carreraId: 1, codigo: "2027-1", actual: true, estadoPlanificacion: "preparacion" });
    expect(nueva.body.data).not.toHaveProperty("horarioPublicado");
    expect(nueva.body.data).not.toHaveProperty("anio");
    expect(planificacionesSemestresRepository.create).toHaveBeenCalledWith({ carreraId: 1, codigo: "2027-1", actual: true, estadoPlanificacion: "preparacion" });
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ codigo: "2028-1" })).status).toBe(200);
    expect(planificacionesSemestresRepository.update).toHaveBeenCalledWith(7, 1, { codigo: "2028-1" });
  });
  it.each(["2026-1", "2026-2", "0000-1", "9999-2"])("acepta codigo ASCII %s en POST y PATCH sin normalizar", async codigo => {
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo })).status).toBe(201);
    expect(planificacionesSemestresRepository.create).toHaveBeenCalledWith({ carreraId: 1, codigo, actual: true, estadoPlanificacion: "preparacion" });
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ codigo })).status).toBe(200);
    expect(planificacionesSemestresRepository.update).toHaveBeenCalledWith(7, 1, { codigo });
  });
  it.each(["026-1", "20266-1", "2026-0", "2026-3", " 2026-1", "2026-1 ", "", "２０２６-1", "2026–1", "2026-11", "2026-1\n", "2026-1\r\n"])("rechaza codigo malformado %j en POST y PATCH", async codigo => {
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo })).status).toBe(400);
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ codigo })).status).toBe(400);
    expect(planificacionesSemestresRepository.create).not.toHaveBeenCalled();
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
  it("rechaza anio eliminado tanto en POST como en PATCH", async () => {
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2026-1", anio: 2026 })).status).toBe(400);
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ anio: 2026 })).status).toBe(400);
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
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "secretaria").send({ codigo: "2028-1" })).status).toBe(403);
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
  it("acepta actual true explícito y rechaza crear un período no actual", async () => {
    const datos = { carreraId: 1, codigo: "2027-1", actual: true };
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send(datos)).status).toBe(201);
    expect(planificacionesSemestresRepository.create).toHaveBeenCalledWith({ ...datos, estadoPlanificacion: "preparacion" });
    vi.mocked(planificacionesSemestresRepository.create).mockClear();
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ ...datos, actual: false })).status).toBe(400);
    expect(planificacionesSemestresRepository.create).not.toHaveBeenCalled();
  });
  it("admin conserva PATCH de actual sin heredar el valor automático de creación", async () => {
    for (const actual of [true, false]) {
      expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({ actual })).status).toBe(200);
      expect(planificacionesSemestresRepository.update).toHaveBeenLastCalledWith(7, 1, { actual });
    }
    expect((await request(app).patch("/api/planificaciones-semestres/7").set("x-rol", "admin").send({})).status).toBe(400);
    expect(planificacionesSemestresRepository.update).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, 1.5, "1", null])("rechaza carrera inválida %j antes de insertar", async carreraId => {
    expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId, codigo: "2027-1" })).status).toBe(400);
    expect(planificacionesSemestresRepository.create).not.toHaveBeenCalled();
  });
  it("no permite estado en la creación ni mutaciones sin autenticación", async () => {
    for (const estadoPlanificacion of ["preparacion", "propuesta", "publicado"]) {
      expect((await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2027-1", estadoPlanificacion })).status).toBe(400);
    }
    expect((await request(app).post("/api/planificaciones-semestres").send({ carreraId: 1, codigo: "2027-1" })).status).toBe(401);
    expect((await request(app).patch("/api/planificaciones-semestres/7").send({ actual: true })).status).toBe(401);
    expect(planificacionesSemestresRepository.create).not.toHaveBeenCalled();
    expect(planificacionesSemestresRepository.update).not.toHaveBeenCalled();
  });
  it("devuelve 404 claro cuando no existe la carrera", async () => {
    vi.mocked(planificacionesSemestresRepository.create).mockRejectedValue(new NotFoundError("Carrera no encontrada"));
    const respuesta = await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 404, codigo: "2027-1" });
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toMatchObject({ status: "error", message: "Carrera no encontrada" });
  });
  it.each(["constraint", "constraint_name"])("traduce duplicado por carrera con %s incluso envuelto por Drizzle", async campo => {
    const causa = Object.assign(new Error("duplicate"), { code: "23505", [campo]: "planificaciones_semestres_carrera_codigo_unique" });
    vi.mocked(planificacionesSemestresRepository.create).mockRejectedValue(new Error("query", { cause: causa }));
    const respuesta = await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2027-1" });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 409, message: "Período existente" });
  });
  it.each([
    { code: "23505", constraint: "planificaciones_semestres_carrera_actual_unique" },
    { code: "23505" },
    { code: "23505", constraint: "unknown_constraint" },
    { code: "23503", constraint: "planificaciones_semestres_carrera_codigo_unique" },
  ])("no disfraza errores ajenos como código duplicado: %j", async detalle => {
    const error = Object.assign(new Error("storage failure"), detalle);
    Object.assign(error, { cause: error });
    vi.mocked(planificacionesSemestresRepository.create).mockRejectedValue(error);
    const respuesta = await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2027-1" });
    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 500, message: "Internal server error" });
  });
  it("finds a deeply wrapped known duplicate without broadening unrelated errors", async () => {
    let error = Object.assign(new Error("duplicate"), { code: "23505", constraint: "planificaciones_semestres_carrera_codigo_unique" });
    for (let nivel = 0; nivel < 12; nivel++) error = new Error("query", { cause: error }) as typeof error;
    vi.mocked(planificacionesSemestresRepository.create).mockRejectedValue(error);
    const respuesta = await request(app).post("/api/planificaciones-semestres").set("x-rol", "admin").send({ carreraId: 1, codigo: "2027-1" });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 409, message: "Período existente" });
  });
});
