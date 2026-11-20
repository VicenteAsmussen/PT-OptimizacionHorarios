import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { horariosRouter } from "../src/routes/horarios.routes.js";
import { horariosService } from "../src/services/horarios.service.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { generateToken } from "../src/utils/jwt.js";

vi.mock("../src/config/env.js", () => ({ env: { JWT_SECRET: "synthetic-external-permissions-test-key", JWT_EXPIRES_IN: "1h" } }));
const usuarios = vi.hoisted(() => new Map<number, any>());
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: {
  findById: vi.fn(async (id: number) => usuarios.get(id)),
} }));
vi.mock("../src/services/horarios.service.js", () => ({ horariosService: {
  coberturaExcelExternos: vi.fn(), importarExcelExternos: vi.fn(),
} }));
const aplicacion = express();
aplicacion.use("/horarios", horariosRouter);
aplicacion.use(errorHandler);
beforeEach(() => { vi.clearAllMocks(); usuarios.clear(); });
it.each(["admin", "profesor"] as const)("rechaza %s con JWT real antes de validar el contexto o analizar multipart", async rol => {
  const usuario = { id: 1, nombre: "Cuenta sintética", correo: "user@example.test", rol };
  const token = generateToken(usuario, 0);
  usuarios.set(usuario.id, { ...usuario, versionSesion: 0 });
  const esperado = { status: "error", statusCode: 403,
    message: `Acceso denegado: Se requiere uno de los roles [secretaria], tu rol actual es '${rol}'` };
  const consulta = "?planificacionSemestreId=oops&departamentoId=4";
  const cobertura = await request(aplicacion).get(`/horarios/excel/externos/cobertura${consulta}`).set("Authorization", `Bearer ${token}`);
  expect(cobertura.status).toBe(403); expect(cobertura.body).toEqual(esperado);
  const importacion = await request(aplicacion).post(`/horarios/excel/externos/importar${consulta}`)
    .set("Authorization", `Bearer ${token}`).set("Content-Type", "multipart/form-data; boundary=x").send("--x\r\nunfinished");
  expect(importacion.status).toBe(403); expect(importacion.body).toEqual(esperado);
  expect(horariosService.coberturaExcelExternos).not.toHaveBeenCalled();
  expect(horariosService.importarExcelExternos).not.toHaveBeenCalled();
});
it("las rutas de externos exigen autenticación antes de procesar el contexto o cargar archivos", async () => {
  expect((await request(aplicacion).get("/horarios/excel/externos/cobertura")).status).toBe(401);
  expect((await request(aplicacion).post("/horarios/excel/externos/importar").send("invalid upload")).status).toBe(401);
  expect(horariosService.coberturaExcelExternos).not.toHaveBeenCalled();
  expect(horariosService.importarExcelExternos).not.toHaveBeenCalled();
});
