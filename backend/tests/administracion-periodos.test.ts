import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { administracionPeriodosRouter } from "../src/routes/administracion-periodos.routes.js";
import { administracionPeriodosRepository as repositorio } from "../src/repositories/administracion-periodos.repository.js";

vi.mock("../src/repositories/administracion-periodos.repository.js", () => ({ administracionPeriodosRepository: {
  resumen: vi.fn(), reiniciar: vi.fn(), cambiarEstado: vi.fn(),
} }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: Request, res: Response, next: NextFunction) => {
  const rol = req.header("x-rol");
  if (!rol) { res.sendStatus(401); return; }
  req.user = { id: 1, rol } as Request["user"];
  next();
} }));
const app = express();
app.use(express.json());
app.use("/api/administracion-periodos", administracionPeriodosRouter);
app.use((error: { statusCode?: number; message: string }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error.statusCode ?? 500).json({ message: error.message });
});
const raiz = "/api/administracion-periodos/7";
const reinicio = { objetivo: "ofertas", alcance: "gestionadas", huella: "a".repeat(64), confirmacion: "2026-2" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repositorio.resumen).mockResolvedValue({ ofertas: 2, asignaciones: 3, horarios: 4 } as never);
  vi.mocked(repositorio.reiniciar).mockResolvedValue({ ofertas: 2, asignaciones: 3, horarios: 4 });
  vi.mocked(repositorio.cambiarEstado).mockResolvedValue({ estadoPlanificacion: "publicado" } as never);
});
describe("Period maintenance HTTP (offline)", () => {
  it.each([undefined, "secretaria", "profesor"])("rejects every operation for %s without repository access", async rol => {
    for (const solicitud of [request(app).get(`${raiz}/resumen?alcance=todas`),
      request(app).post(`${raiz}/reiniciar`).send(reinicio),
      request(app).patch(`${raiz}/estado`).send({ estadoAnterior: "preparacion", estadoPlanificacion: "publicado" })]) {
      if (rol) solicitud.set("x-rol", rol);
      expect((await solicitud).status).toBe(rol ? 403 : 401);
    }
    expect(repositorio.resumen).not.toHaveBeenCalled();
    expect(repositorio.reiniciar).not.toHaveBeenCalled();
    expect(repositorio.cambiarEstado).not.toHaveBeenCalled();
  });
  it.each(["gestionadas", "externas", "todas"])("previews and resets each target in scope %s", async alcance => {
    const respuesta = await request(app).get(`${raiz}/resumen?alcance=${alcance}`).set("x-rol", "admin");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ ofertas: 2, asignaciones: 3, horarios: 4 });
    expect(respuesta.headers["cache-control"]).toContain("no-store");
    expect(repositorio.resumen).toHaveBeenCalledWith(7, alcance);
    for (const objetivo of ["ofertas", "horarios"]) {
      const datos = { ...reinicio, alcance, objetivo };
      expect((await request(app).post(`${raiz}/reiniciar`).set("x-rol", "admin").send(datos)).status).toBe(200);
      expect(repositorio.reiniciar).toHaveBeenLastCalledWith(7, datos);
    }
  });
  it.each(["preparacion", "propuesta", "publicado"])("accepts every transition from %s", async estadoAnterior => {
    for (const estadoPlanificacion of ["preparacion", "propuesta", "publicado"]) {
      const datos = { estadoAnterior, estadoPlanificacion };
      expect((await request(app).patch(`${raiz}/estado`).set("x-rol", "admin").send(datos)).status).toBe(200);
      expect(repositorio.cambiarEstado).toHaveBeenLastCalledWith(7, datos);
    }
  });
  it.each([
    { ...reinicio, alcance: "icinf" }, { ...reinicio, objetivo: "periodo" },
    { ...reinicio, huella: "" }, { ...reinicio, confirmacion: "CONFIRMAR" },
    { ...reinicio, carreraId: 9 }, { ...reinicio, actual: true }, {},
  ])("rejects malformed or broadened reset input %j", async datos => {
    expect((await request(app).post(`${raiz}/reiniciar`).set("x-rol", "admin").send(datos)).status).toBe(400);
    expect(repositorio.reiniciar).not.toHaveBeenCalled();
  });
  it("rejects invalid state and additional fields without changing ordinary metadata", async () => {
    for (const datos of [{ estadoPlanificacion: "otro", estadoAnterior: "preparacion" },
      { estadoPlanificacion: "publicado" }, { estadoPlanificacion: "publicado", estadoAnterior: "preparacion", actual: true }]) {
      expect((await request(app).patch(`${raiz}/estado`).set("x-rol", "admin").send(datos)).status).toBe(400);
    }
    expect(repositorio.cambiarEstado).not.toHaveBeenCalled();
    expect((await request(app).get(`${raiz}/resumen?alcance=todas&carreraId=2`).set("x-rol", "admin")).status).toBe(400);
    expect((await request(app).get("/api/administracion-periodos/0/resumen?alcance=todas").set("x-rol", "admin")).status).toBe(400);
  });
  it("preserves stale-confirmation conflict responses", async () => {
    vi.mocked(repositorio.reiniciar).mockRejectedValue(Object.assign(new Error("Los datos cambiaron"), { statusCode: 409 }));
    const respuesta = await request(app).post(`${raiz}/reiniciar`).set("x-rol", "admin").send(reinicio);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.message).toBe("Los datos cambiaron");
  });
});
