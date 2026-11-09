import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const dobles = vi.hoisted(() => ({ leer: vi.fn(), borrarSeguro: vi.fn(), borrarPartTime: vi.fn(), horarios: vi.fn(), acceso: vi.fn() }));
vi.mock("../src/repositories/profesores.repository.js", () => ({ profesoresRepository: {
  findById: dobles.leer, deleteSinDependencias: dobles.borrarSeguro, deleteWithDependencias: dobles.borrarPartTime,
  hasHorarios: dobles.horarios, deleteUsuarioForProfesor: dobles.acceso,
} }));
vi.mock("../src/repositories/carreras.repository.js", () => ({ carrerasRepository: {
  findAlcanceByUsuarioId: async () => ({ carreraId: 1, departamentosIds: [1], departamentosGestionadosIds: [1] }),
} }));
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: { findById: async () => ({ rol: "profesor" }) } }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (peticion: any, _respuesta: any, siguiente: any) => {
  peticion.user = { id: 1, rol: peticion.header("x-rol") ?? "admin" }; siguiente();
} }));
import { profesoresRouter } from "../src/routes/profesores.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/profesores", profesoresRouter);
aplicacion.use(errorHandler);
beforeEach(() => {
  vi.clearAllMocks();
  dobles.leer.mockResolvedValue({ id: 7, departamentoId: 1, tipo: "part time", usuarioId: 8 });
  dobles.horarios.mockResolvedValue(false);
});
it("admin borra por la guarda atómica, nunca por la limpieza académica", async () => {
  const respuesta = await request(aplicacion).delete("/profesores/7");
  expect(respuesta.status).toBe(204);
  expect(respuesta.text).toBe("");
  expect(dobles.borrarSeguro).toHaveBeenCalledWith(7, 8);
  expect(dobles.borrarPartTime).not.toHaveBeenCalled();
});
it("secretaría conserva el borrado part time autorizado sin un veto nuevo por disponibilidad", async () => {
  const respuesta = await request(aplicacion).delete("/profesores/7").set("x-rol", "secretaria");
  expect(respuesta.status).toBe(204);
  expect(respuesta.text).toBe("");
  expect(dobles.borrarPartTime).toHaveBeenCalledWith(7, 8, true);
  expect(dobles.borrarSeguro).not.toHaveBeenCalled();
});
it.each(["admin", "secretaria"])("%s conserva retirar acceso sin borrar perfil ni academia", async rol => {
  const respuesta = await request(aplicacion).delete("/profesores/7/usuario").set("x-rol", rol);
  expect(respuesta.status).toBe(204);
  expect(respuesta.text).toBe("");
  expect(dobles.acceso).toHaveBeenCalledWith(...(rol === "secretaria" ? [7, 8, true] : [7, 8]));
  expect(dobles.borrarSeguro).not.toHaveBeenCalled();
  expect(dobles.borrarPartTime).not.toHaveBeenCalled();
});
