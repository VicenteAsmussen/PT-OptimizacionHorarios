import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { asignaturasRouter } from "../src/routes/asignaturas.routes.js";
import { ofertasRouter } from "../src/routes/ofertas.routes.js";
import { horariosRouter } from "../src/routes/horarios.routes.js";
import { carrerasRouter } from "../src/routes/carreras.routes.js";
import { departamentosRouter } from "../src/routes/departamentos.routes.js";
import { disponibilidadRouter } from "../src/routes/disponibilidad.routes.js";
import { asignaturasService } from "../src/services/asignaturas.service.js";
import { profesoresService } from "../src/services/profesores.service.js";
import { ofertasService } from "../src/services/ofertas.service.js";
import { horariosService } from "../src/services/horarios.service.js";
import { carrerasService } from "../src/services/carreras.service.js";
import { departamentosService } from "../src/services/departamentos.service.js";
import { disponibilidadService } from "../src/services/disponibilidad.service.js";
import { carrerasRepository } from "../src/repositories/carreras.repository.js";
import { departamentosRepository } from "../src/repositories/departamentos.repository.js";
import { disponibilidadRepository } from "../src/repositories/disponibilidad.repository.js";
import { resolverAlcanceCarrera } from "../src/utils/alcance-carrera.js";
import { planificacionesSemestresRepository } from "../src/repositories/planificaciones-semestres.repository.js";
import { asignaturasRepository } from "../src/repositories/asignaturas.repository.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { ofertasRepository } from "../src/repositories/ofertas.repository.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
vi.mock("../src/repositories/planificaciones-semestres.repository.js", () => ({ planificacionesSemestresRepository: { findById: vi.fn(), asignaturaPertenece: vi.fn(), findAll: vi.fn(), findProfesorByUsuarioId: vi.fn(), profesorAutorizado: vi.fn() } }));
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: { findByCorreo: vi.fn() } }));
vi.mock("../src/repositories/carreras.repository.js", () => ({ carrerasRepository: { findAlcanceByUsuarioId: vi.fn(), findAll: vi.fn(), findById: vi.fn() } }));
vi.mock("../src/repositories/asignaturas.repository.js", () => ({ asignaturasRepository: { findAll: vi.fn(), findByCodigo: vi.fn(), update: vi.fn(), create: vi.fn() } }));
vi.mock("../src/repositories/profesores.repository.js", () => ({ profesoresRepository: { findAll: vi.fn(), findById: vi.fn(), update: vi.fn(), create: vi.fn() } }));
vi.mock("../src/repositories/ofertas.repository.js", () => ({ ofertasRepository: { findAll: vi.fn(), findById: vi.fn(), update: vi.fn(), create: vi.fn() } }));
vi.mock("../src/repositories/horarios.repository.js", () => ({ horariosRepository: { findAll: vi.fn(), findById: vi.fn(), update: vi.fn(), create: vi.fn(), deleteByOferta: vi.fn(), findOfertaWithDetails: vi.fn() } }));
vi.mock("../src/repositories/departamentos.repository.js", () => ({ departamentosRepository: { findAll: vi.fn(), findById: vi.fn(), hasAsignaturas: vi.fn(), delete: vi.fn() } }));
vi.mock("../src/repositories/disponibilidad.repository.js", () => ({ disponibilidadRepository: { findAll: vi.fn(), findById: vi.fn(), create: vi.fn(), syncDisponibilidad: vi.fn(), delete: vi.fn(), deleteByProfesorAndPlanificacion: vi.fn(), checkProfesorExists: vi.fn(), findExistingBloquesIds: vi.fn(), checkHorariosExistForPlanificacion: vi.fn() } }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: Request, _res: Response, next: NextFunction) => {
  req.user = { id: 42, rol: req.header("x-rol") ?? "secretaria" } as Request["user"];
  next();
} }));
const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/asignaturas", asignaturasRouter);
aplicacion.use("/ofertas", ofertasRouter);
aplicacion.use("/horarios", horariosRouter);
aplicacion.use("/carreras", carrerasRouter);
aplicacion.use("/departamentos", departamentosRouter);
aplicacion.use("/disponibilidad", disponibilidadRouter);
aplicacion.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => res.sendStatus(error.statusCode ?? 500));
const alcance = { carreraId: 1, asignaturasCodigos: ["LOCAL"], departamentosIds: [4], profesoresIds: [7], ofertasIds: [9] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(alcance);
  vi.mocked(asignaturasRepository.findByCodigo).mockResolvedValue({ codigo: "OTRA" } as never);
  vi.mocked(profesoresRepository.findById).mockResolvedValue({ id: 8, departamentoId: 5 } as never);
  vi.mocked(ofertasRepository.findById).mockResolvedValue({ id: 10, asignaturaCodigo: "OTRA", planificacionSemestreId: 2, planificacionSemestre: { carreraId: 2 }, horarios: [] } as never);
  vi.mocked(horariosRepository.findById).mockResolvedValue({ id: 20, ofertaId: 10, planificacionSemestreId: 2, planificacionSemestre: { carreraId: 2 } } as never);
  vi.mocked(horariosRepository.findOfertaWithDetails).mockResolvedValue({ id: 10, planificacionSemestreId: 2 } as never);
  vi.mocked(planificacionesSemestresRepository.findById).mockImplementation(async id => ({ id, carreraId: id === 1 ? 1 : 2, actual: true, estadoPlanificacion: "preparacion" }) as never);
  vi.mocked(planificacionesSemestresRepository.asignaturaPertenece).mockImplementation(async (_carreraId, codigo) => codigo === "LOCAL");
  vi.mocked(planificacionesSemestresRepository.findProfesorByUsuarioId).mockResolvedValue({ id: 7, departamentoId: 4 });
  vi.mocked(planificacionesSemestresRepository.profesorAutorizado).mockImplementation(async carreraId => carreraId === 1);
  vi.mocked(planificacionesSemestresRepository.findAll).mockResolvedValue([{ id: 1, carreraId: 1 }] as never);
});
describe("departamento de asignaturas", () => {
  it.each(["0", "-1", "1.5", "abc", "", "1&departamentoId=2"])("rechaza filtro inválido %s", async (valor) => {
    expect((await request(aplicacion).get(`/asignaturas?departamentoId=${valor}`)).status).toBe(400);
    expect(asignaturasRepository.findAll).not.toHaveBeenCalled();
  });
  it("propaga filtro sin reemplazar el alcance de carrera", async () => {
    expect((await request(aplicacion).get("/asignaturas?departamentoId=5")).status).toBe(200);
    expect(asignaturasRepository.findAll).toHaveBeenCalledWith(alcance, 5);
  });
  it("rechaza departamento inexistente al crear y actualizar", async () => {
    vi.mocked(asignaturasRepository.findByCodigo).mockResolvedValueOnce(undefined);
    vi.mocked(departamentosRepository.findById).mockResolvedValue(undefined);
    await expect(asignaturasService.createAsignatura({ codigo: "NUEVA", nombre: "Nueva", semestreMalla: 1, departamentoId: 99, esCritica: false, tiposHora: [], carrerasIds: [] })).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(asignaturasRepository.findByCodigo).mockReset().mockResolvedValue({ codigo: "OTRA" } as never);
    await expect(asignaturasService.updateAsignatura("OTRA", { departamentoId: 99 })).rejects.toMatchObject({ statusCode: 400 });
    expect(asignaturasRepository.create).not.toHaveBeenCalled();
    expect(asignaturasRepository.update).not.toHaveBeenCalled();
  });
  it("persiste departamento válido sin limitarlo por los departamentos de la carrera", async () => {
    vi.mocked(asignaturasRepository.findByCodigo).mockResolvedValueOnce(undefined);
    vi.mocked(departamentosRepository.findById).mockResolvedValue({ id: 5 } as never);
    await asignaturasService.createAsignatura({ codigo: "NUEVA", nombre: "Nueva", semestreMalla: 1, departamentoId: 5, esCritica: false, tiposHora: [], carrerasIds: [] });
    expect(asignaturasRepository.create).toHaveBeenCalledWith(expect.objectContaining({ departamentoId: 5 }), [], []);
    vi.mocked(asignaturasRepository.findByCodigo).mockResolvedValue({ codigo: "LOCAL" } as never);
    await asignaturasService.updateAsignatura("LOCAL", { departamentoId: 5 }, alcance);
    expect(asignaturasRepository.update).toHaveBeenCalledWith("LOCAL", { departamentoId: 5 }, undefined, undefined);
  });
  it("traduce conflicto concurrente de la FK y permite borrar sin asignaturas", async () => {
    vi.mocked(departamentosRepository.findById).mockResolvedValue({ id: 5 } as never);
    vi.mocked(departamentosRepository.hasAsignaturas).mockResolvedValue(false);
    vi.mocked(departamentosRepository.delete).mockRejectedValueOnce({ cause: { code: "23503", constraint_name: "asignaturas_departamento_id_departamentos_id_fk" } });
    await expect(departamentosService.deleteDepartamento(5)).rejects.toMatchObject({ statusCode: 409 });
    vi.mocked(departamentosRepository.delete).mockResolvedValueOnce(true);
    await expect(departamentosService.deleteDepartamento(5)).resolves.toBeUndefined();
  });
  it("impide eliminar un departamento con asignaturas", async () => {
    vi.mocked(departamentosRepository.findById).mockResolvedValue({ id: 5 } as never);
    vi.mocked(departamentosRepository.hasAsignaturas).mockResolvedValue(true);
    await expect(departamentosService.deleteDepartamento(5)).rejects.toMatchObject({ statusCode: 409 });
    expect(departamentosRepository.delete).not.toHaveBeenCalled();
  });
});
describe("aislamiento de lecturas", () => {
  it("asignaturas solo consulta el alcance y oculta detalle ajeno", async () => {
    await asignaturasService.getAllAsignaturas(alcance);
    expect(asignaturasRepository.findAll).toHaveBeenCalledWith(alcance, undefined);
    await expect(asignaturasService.getAsignaturaByCodigo("OTRA", alcance)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("profesores filtra y rechaza departamento ajeno", async () => {
    await profesoresService.getAllProfesores(undefined, alcance);
    expect(profesoresRepository.findAll).toHaveBeenCalledWith(undefined, alcance);
    await expect(profesoresService.getProfesorById(8, alcance)).rejects.toMatchObject({ statusCode: 404 });
    await expect(profesoresService.getAllProfesores(5, alcance)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("ofertas filtra y oculta detalle ajeno", async () => {
    await ofertasService.getAllOfertas(undefined, alcance);
    expect(ofertasRepository.findAll).toHaveBeenCalledWith(undefined, alcance);
    await expect(ofertasService.getOfertaById(10, alcance)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("horarios filtra y oculta detalle ajeno", async () => {
    await horariosService.getAllHorarios(undefined, alcance);
    expect(horariosRepository.findAll).toHaveBeenCalledWith(undefined, alcance);
    await expect(horariosService.getHorarioById(20, alcance)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("admin conserva detalle global", async () => {
    expect(await asignaturasService.getAsignaturaByCodigo("OTRA")).toMatchObject({ codigo: "OTRA" });
    expect(await profesoresService.getProfesorById(8)).toMatchObject({ id: 8 });
    expect(await ofertasService.getOfertaById(10)).toMatchObject({ id: 10 });
    expect(await horariosService.getHorarioById(20)).toMatchObject({ id: 20 });
  });
});
it("no actualiza ni crea una asignatura exclusivamente ajena", async () => {
  await expect(asignaturasService.updateAsignatura("OTRA", { nombre: "Cambio" }, alcance)).rejects.toMatchObject({ statusCode: 404 });
  await expect(asignaturasService.createAsignatura({ codigo: "NUEVA", nombre: "Nueva", carrerasIds: [2] } as never, alcance)).rejects.toMatchObject({ statusCode: 400 });
  await expect(asignaturasService.createAsignatura({ codigo: "COMPARTIDA", nombre: "Compartida", carrerasIds: [1, 2] } as never, alcance)).rejects.toMatchObject({ statusCode: 400 });
  expect(asignaturasRepository.update).not.toHaveBeenCalled();
  expect(asignaturasRepository.create).not.toHaveBeenCalled();
});
it("no crea profesor, oferta ni horario fuera del alcance", async () => {
  await expect(profesoresService.createProfesor({ departamentoId: 5, rut: "12345678-5" } as never, alcance)).rejects.toMatchObject({ statusCode: 403 });
  await expect(ofertasService.createOferta({ asignaturaCodigo: "LOCAL", profesorId: 8, planificacionSemestreId: 2 } as never, alcance)).rejects.toMatchObject({ statusCode: 404 });
  await expect(horariosService.createHorario({ ofertaId: 10 } as never, alcance)).rejects.toMatchObject({ statusCode: 404 });
  expect(profesoresRepository.create).not.toHaveBeenCalled();
  expect(ofertasRepository.create).not.toHaveBeenCalled();
  expect(horariosRepository.create).not.toHaveBeenCalled();
});
it("propaga identidad autenticada en HTTP de asignaturas, ofertas y horarios", async () => {
  for (const ruta of ["/asignaturas", "/ofertas", "/horarios"]) {
    expect((await request(aplicacion).get(ruta)).status).toBe(200);
  }
  expect(carrerasRepository.findAlcanceByUsuarioId).toHaveBeenCalledWith(42);
  expect(asignaturasRepository.findAll).toHaveBeenCalledWith(alcance, undefined);
  expect(ofertasRepository.findAll).toHaveBeenCalledWith({}, alcance);
  expect(horariosRepository.findAll).toHaveBeenCalledWith({}, alcance);
  for (const ruta of ["/asignaturas/OTRA", "/ofertas/10", "/horarios/20"]) {
    expect((await request(aplicacion).get(ruta)).status).toBe(404);
    expect((await request(aplicacion).get(ruta).set("x-rol", "admin")).status).toBe(200);
  }
});
it.each(["/carreras", "/departamentos"])("secretaria no puede mutar catálogo %s", async (ruta) => {
  expect((await request(aplicacion).post(ruta).send({ nombre: "Nuevo" })).status).toBe(403);
  expect((await request(aplicacion).put(`${ruta}/1`).send({ nombre: "Cambio" })).status).toBe(403);
  expect((await request(aplicacion).delete(`${ruta}/1`)).status).toBe(403);
});
it("secretaria sincroniza preparación actual con horarios sin dar acceso a profesor ajeno", async () => {
  vi.mocked(disponibilidadRepository.checkProfesorExists).mockResolvedValue(true);
  vi.mocked(disponibilidadRepository.findExistingBloquesIds).mockResolvedValue([]);
  vi.mocked(disponibilidadRepository.checkHorariosExistForPlanificacion).mockResolvedValue(true);
  vi.mocked(disponibilidadRepository.syncDisponibilidad).mockResolvedValue([]);
  expect((await request(aplicacion).post("/disponibilidad/sincronizar").send({ profesorId: 7, planificacionSemestreId: 1, bloquesIds: [] })).status).toBe(200);
  expect(disponibilidadRepository.syncDisponibilidad).toHaveBeenCalledWith(7, 1, []);
  vi.mocked(disponibilidadRepository.syncDisponibilidad).mockClear();
  expect((await request(aplicacion).post("/disponibilidad/sincronizar").send({ profesorId: 8, planificacionSemestreId: 1, bloquesIds: [] })).status).toBe(403);
  expect(disponibilidadRepository.syncDisponibilidad).not.toHaveBeenCalled();
});
it("resuelve desde usuario y falla cerrado sin perfil; admin no consulta perfil", async () => {
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(alcance);
  expect(await resolverAlcanceCarrera({ id: 42, rol: "secretaria" })).toEqual(alcance);
  expect(carrerasRepository.findAlcanceByUsuarioId).toHaveBeenCalledWith(42);
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockResolvedValue(undefined);
  await expect(resolverAlcanceCarrera({ id: 43, rol: "secretaria" })).rejects.toMatchObject({ statusCode: 403 });
  await expect(resolverAlcanceCarrera()).rejects.toMatchObject({ statusCode: 403 });
  vi.mocked(carrerasRepository.findAlcanceByUsuarioId).mockClear();
  expect(await resolverAlcanceCarrera({ id: 1, rol: "admin" })).toBeUndefined();
  expect(carrerasRepository.findAlcanceByUsuarioId).not.toHaveBeenCalled();
});
it("permite detalle local y profesor de departamento externo relacionado", async () => {
  vi.mocked(asignaturasRepository.findByCodigo).mockResolvedValue({ codigo: "LOCAL" } as never);
  vi.mocked(profesoresRepository.findById).mockResolvedValue({ id: 7, departamentoId: 4, departamento: { esGestionado: false } } as never);
  vi.mocked(ofertasRepository.findById).mockResolvedValue({ id: 9, asignaturaCodigo: "LOCAL", planificacionSemestreId: 1, planificacionSemestre: { carreraId: 1 }, horarios: [] } as never);
  vi.mocked(horariosRepository.findById).mockResolvedValue({ id: 20, ofertaId: 9, planificacionSemestreId: 1, planificacionSemestre: { carreraId: 1 } } as never);
  expect(await asignaturasService.getAsignaturaByCodigo("LOCAL", alcance)).toMatchObject({ codigo: "LOCAL" });
  expect(await profesoresService.getProfesorById(7, alcance)).toMatchObject({ id: 7 });
  expect(await ofertasService.getOfertaById(9, alcance)).toMatchObject({ id: 9 });
  expect(await horariosService.getHorarioById(20, alcance)).toMatchObject({ id: 20 });
});
it("impide quitar la carrera propia y cambiar relaciones hacia recursos ajenos", async () => {
  vi.mocked(asignaturasRepository.findByCodigo).mockResolvedValue({ codigo: "LOCAL" } as never);
  await expect(asignaturasService.updateAsignatura("LOCAL", { carrerasIds: [] }, alcance)).rejects.toMatchObject({ statusCode: 400 });
  await expect(asignaturasService.updateAsignatura("LOCAL", { carrerasIds: [1, 2] }, alcance)).rejects.toMatchObject({ statusCode: 400 });
  vi.mocked(profesoresRepository.findById).mockResolvedValue({ id: 7, departamentoId: 4 } as never);
  await expect(profesoresService.updateProfesor(7, { departamentoId: 5 }, alcance)).rejects.toMatchObject({ statusCode: 403 });
  vi.mocked(ofertasRepository.findById).mockResolvedValue({ id: 9, asignaturaCodigo: "LOCAL", profesorId: 7, planificacionSemestreId: 1, planificacionSemestre: { carreraId: 1 }, horarios: [] } as never);
  await expect(ofertasService.updateOferta(9, { asignaturaCodigo: "OTRA" }, alcance)).rejects.toMatchObject({ statusCode: 400 });
  await expect(ofertasService.updateOferta(9, { planificacionSemestreId: 2 }, alcance)).rejects.toMatchObject({ statusCode: 404 });
  vi.mocked(horariosRepository.findById).mockResolvedValue({ id: 20, ofertaId: 9, planificacionSemestreId: 1, planificacionSemestre: { carreraId: 1 } } as never);
  await expect(horariosService.updateHorario(20, { ofertaId: 10 }, alcance)).rejects.toMatchObject({ statusCode: 404 });
  await expect(horariosService.deleteHorariosByOferta(10, alcance)).rejects.toMatchObject({ statusCode: 404 });
  expect(asignaturasRepository.update).not.toHaveBeenCalled();
  expect(profesoresRepository.update).not.toHaveBeenCalled();
  expect(ofertasRepository.update).not.toHaveBeenCalled();
  expect(horariosRepository.update).not.toHaveBeenCalled();
  expect(horariosRepository.deleteByOferta).not.toHaveBeenCalled();
});
it("filtra catálogos y disponibilidad, y deniega mutaciones de disponibilidad ajena", async () => {
  await carrerasService.getAllCarreras(alcance);
  await departamentosService.getAllDepartamentos(alcance);
  await disponibilidadService.getDisponibilidad(undefined, alcance);
  expect(carrerasRepository.findAll).toHaveBeenCalledWith(alcance);
  expect(departamentosRepository.findAll).toHaveBeenCalledWith(alcance);
  expect(disponibilidadRepository.findAll).toHaveBeenCalledWith(undefined, alcance);
  vi.mocked(carrerasRepository.findById).mockResolvedValue({ id: 2 } as never);
  vi.mocked(departamentosRepository.findById).mockResolvedValue({ id: 5 } as never);
  vi.mocked(disponibilidadRepository.findById).mockResolvedValue({ id: 1, profesorId: 8, planificacionSemestreId: 2 } as never);
  await expect(carrerasService.getCarreraById(2, alcance)).rejects.toMatchObject({ statusCode: 404 });
  await expect(departamentosService.getDepartamentoById(5, alcance)).rejects.toMatchObject({ statusCode: 404 });
  await expect(disponibilidadService.getById(1, alcance)).rejects.toMatchObject({ statusCode: 404 });
  await expect(disponibilidadService.createSingle({ profesorId: 8 } as never, alcance)).rejects.toMatchObject({ statusCode: 403 });
  await expect(disponibilidadService.syncGrid({ profesorId: 8 } as never, alcance)).rejects.toMatchObject({ statusCode: 403 });
  await expect(disponibilidadService.deleteSingle(1, alcance)).rejects.toMatchObject({ statusCode: 404 });
  await expect(disponibilidadService.clearGrid(8, 1, alcance)).rejects.toMatchObject({ statusCode: 403 });
  expect(disponibilidadRepository.create).not.toHaveBeenCalled();
  expect(disponibilidadRepository.syncDisponibilidad).not.toHaveBeenCalled();
  expect(disponibilidadRepository.delete).not.toHaveBeenCalled();
  expect(disponibilidadRepository.deleteByProfesorAndPlanificacion).not.toHaveBeenCalled();
});

it("profesor consulta solo disponibilidad propia en planificaciones autorizadas", async () => {
  const usuario = { id: 42, rol: "profesor" };
  await expect(disponibilidadService.getDisponibilidad({ profesorId: 8 }, undefined, usuario)).rejects.toMatchObject({ statusCode: 403 });
  vi.mocked(disponibilidadRepository.findAll).mockResolvedValue([
    { id: 1, profesorId: 7, planificacionSemestreId: 1 },
    { id: 2, profesorId: 7, planificacionSemestreId: 2 },
  ] as never);
  const propias = await disponibilidadService.getDisponibilidad(undefined, undefined, usuario);
  expect(disponibilidadRepository.findAll).toHaveBeenCalledWith({ profesorId: 7 }, undefined);
  expect(propias.map(fila => fila.id)).toEqual([1]);
  await expect(disponibilidadService.getDisponibilidad({ planificacionSemestreId: 2 }, undefined, usuario)).rejects.toMatchObject({ statusCode: 403 });
  vi.mocked(disponibilidadRepository.findById).mockResolvedValue({ id: 3, profesorId: 8, planificacionSemestreId: 1 } as never);
  await expect(disponibilidadService.getById(3, undefined, usuario)).rejects.toMatchObject({ statusCode: 403 });
});

it("profesor no muta disponibilidad ajena ni planificación no autorizada", async () => {
  const usuario = { id: 42, rol: "profesor" };
  await expect(disponibilidadService.syncGrid({ profesorId: 8, planificacionSemestreId: 1, bloquesIds: [] }, undefined, usuario)).rejects.toMatchObject({ statusCode: 403 });
  await expect(disponibilidadService.syncGrid({ profesorId: 7, planificacionSemestreId: 2, bloquesIds: [] }, undefined, usuario)).rejects.toMatchObject({ statusCode: 403 });
  expect(disponibilidadRepository.syncDisponibilidad).not.toHaveBeenCalled();
});
