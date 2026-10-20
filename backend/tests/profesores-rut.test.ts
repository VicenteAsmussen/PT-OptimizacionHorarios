import { beforeEach, describe, expect, it, vi } from "vitest";
import { profesoresService } from "../src/services/profesores.service.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { createProfesorValidation, updateProfesorValidation } from "../src/validations/profesores.validation.js";
import type { CreateProfesorDTO, UpdateProfesorDTO } from "../src/validations/profesores.validation.js";

// Todos los límites de persistencia y hashing están simulados: no se importa config/db.
vi.mock("../src/repositories/profesores.repository.js", () => ({ profesoresRepository: {
  findByRut: vi.fn(), findById: vi.fn(), checkDepartamentoExists: vi.fn(),
  create: vi.fn(), createWithUsuario: vi.fn(), updateWithSyncedUsuarioName: vi.fn(),
} }));
vi.mock("../src/repositories/usuarios.repository.js", () => ({ usuariosRepository: { findByCorreo: vi.fn() } }));
vi.mock("../src/utils/password.js", () => ({ hashPassword: vi.fn(async () => "hash-simulado") }));

vi.mock("../src/config/db.js", () => ({ db: { query: {
  disponibilidadProfesores: { findMany: vi.fn(async () => []), findFirst: vi.fn() },
  ofertasAsignaturas: { findMany: vi.fn(async () => []), findFirst: vi.fn() },
  horariosAsignaturas: { findMany: vi.fn(async () => []), findFirst: vi.fn() },
  usuarios: { findMany: vi.fn(async () => []), findFirst: vi.fn() },
} } }));

const datos = { nombre: "Profesora", rut: "12.345.678-5", departamentoId: 4, tipo: "part time" as const };
const profesor = { id: 7, ...datos, rut: "12345678-5", usuarioId: null };
const duplicado = { code: "23505", constraint_name: "profesores_rut_unique" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(profesoresRepository.findById).mockResolvedValue(profesor as never);
  vi.mocked(profesoresRepository.findByRut).mockResolvedValue(undefined);
  vi.mocked(profesoresRepository.checkDepartamentoExists).mockResolvedValue(true);
  vi.mocked(profesoresRepository.create).mockResolvedValue(profesor);
  vi.mocked(profesoresRepository.createWithUsuario).mockResolvedValue(profesor);
});

describe("proyecciones anidadas sin nueva exposición de RUT", () => {
  const columnasAnteriores = { id: true, usuarioId: true, departamentoId: true, nombre: true, tipo: true };
  it("disponibilidad conserva los campos anteriores", async () => {
    const { db } = await import("../src/config/db.js");
    const { disponibilidadRepository } = await import("../src/repositories/disponibilidad.repository.js");
    await disponibilidadRepository.findAll();
    await disponibilidadRepository.findById(1);
    // Solo las lecturas de recursos hidratan profesor; findSpecific comprueba existencia.
    expect(db.query.disponibilidadProfesores.findMany).toHaveBeenCalledTimes(1);
    expect(db.query.disponibilidadProfesores.findFirst).toHaveBeenCalledTimes(1);
    for (const consulta of [db.query.disponibilidadProfesores.findMany, db.query.disponibilidadProfesores.findFirst]) {
      for (const [opciones] of vi.mocked(consulta).mock.calls) {
        expect(opciones?.with?.profesor).toMatchObject({ columns: columnasAnteriores });
      }
    }
    vi.mocked(db.query.disponibilidadProfesores.findFirst).mockClear();
    await disponibilidadRepository.findSpecific(7, 1, 1);
    expect(db.query.disponibilidadProfesores.findFirst).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.query.disponibilidadProfesores.findFirst).mock.calls[0]?.[0]?.with).toBeUndefined();
  });
  it("ofertas conserva departamento y campos anteriores", async () => {
    const { db } = await import("../src/config/db.js");
    const { ofertasRepository } = await import("../src/repositories/ofertas.repository.js");
    await ofertasRepository.findAll();
    await ofertasRepository.findById(1);
    for (const consulta of [db.query.ofertasAsignaturas.findMany, db.query.ofertasAsignaturas.findFirst]) {
      expect(vi.mocked(consulta).mock.calls[0]?.[0]?.with?.profesor).toEqual({ columns: columnasAnteriores, with: { departamento: true } });
    }
  });
  it("horarios conserva departamento y campos anteriores", async () => {
    const { db } = await import("../src/config/db.js");
    const { horariosRepository } = await import("../src/repositories/horarios.repository.js");
    await horariosRepository.findAll();
    await horariosRepository.findById(1);
    for (const consulta of [db.query.horariosAsignaturas.findMany, db.query.horariosAsignaturas.findFirst]) {
      expect(vi.mocked(consulta).mock.calls[0]?.[0]?.with?.oferta).toMatchObject({ with: { profesor: { columns: columnasAnteriores, with: { departamento: true } } } });
    }
    await horariosRepository.findOfertaWithDetails(1);
    expect(vi.mocked(db.query.ofertasAsignaturas.findFirst).mock.calls[0]?.[0]?.with?.profesor).toEqual({ columns: columnasAnteriores });
  });
  it("usuarios conserva los campos anteriores del perfil", async () => {
    const { db } = await import("../src/config/db.js");
    const { usuariosRepository } = await vi.importActual<typeof import("../src/repositories/usuarios.repository.js")>("../src/repositories/usuarios.repository.js");
    await usuariosRepository.findAll();
    await usuariosRepository.findById(1);
    await usuariosRepository.findByCorreo("p@example.cl");
    for (const consulta of [db.query.usuarios.findMany, db.query.usuarios.findFirst]) {
      for (const [opciones] of vi.mocked(consulta).mock.calls) {
        expect(opciones?.with?.profesor).toEqual({ columns: columnasAnteriores });
      }
    }
  });
});

describe("validación de payload RUT", () => {
  it("requiere RUT al crear y normaliza en el límite", () => {
    expect(createProfesorValidation.parse(datos).rut).toBe("12345678-5");
    const { rut, ...sinRut } = datos;
    expect(createProfesorValidation.safeParse(sinRut).success).toBe(false);
  });
  it.each([["00000001-9", "1-9"], ["123.456-0", "123456-0"]])("normaliza RUT corto %s en create/update", (rut, esperado) => {
    expect(createProfesorValidation.parse({ ...datos, rut }).rut).toBe(esperado);
    expect(updateProfesorValidation.parse({ rut })).toEqual({ rut: esperado });
  });
  it.each([null, "", "0-0", "12345678-9", "basura123456785"])("rechaza RUT explícito inválido %s en create/update", (rut) => {
    expect(createProfesorValidation.safeParse({ ...datos, rut }).success).toBe(false);
    expect(updateProfesorValidation.safeParse({ rut }).success).toBe(false);
  });
  it("permite actualización parcial sin RUT, normaliza cuando está presente", () => {
    expect(updateProfesorValidation.parse({ nombre: "Cambio" })).toEqual({ nombre: "Cambio" });
    expect(updateProfesorValidation.parse({ rut: "6.000.000-k" })).toEqual({ rut: "6000000-K" });
  });
});

describe("servicio RUT sin bypass en llamadas directas", () => {
  it("crea con RUT canónico conservando ID numérico", async () => {
    expect(await profesoresService.createProfesor(datos)).toMatchObject({ id: 7, rut: "12345678-5" });
    expect(profesoresRepository.findByRut).toHaveBeenCalledWith("12345678-5");
    expect(profesoresRepository.create).toHaveBeenCalledWith({ ...datos, rut: "12345678-5" });
  });
  it.each([undefined, null, "", "12345678-9"])("rechaza create directo inválido %s antes de escribir", async (rut) => {
    await expect(profesoresService.createProfesor({ ...datos, rut } as CreateProfesorDTO)).rejects.toMatchObject({ statusCode: 400 });
    expect(profesoresRepository.create).not.toHaveBeenCalled();
  });
  it.each([null, "", "12345678-9"])("rechaza update directo inválido %s", async (rut) => {
    await expect(profesoresService.updateProfesor(7, { rut } as UpdateProfesorDTO)).rejects.toMatchObject({ statusCode: 400 });
    expect(profesoresRepository.updateWithSyncedUsuarioName).not.toHaveBeenCalled();
  });
  it("rechaza duplicados al crear o actualizar", async () => {
    vi.mocked(profesoresRepository.findByRut).mockResolvedValue({ ...profesor, id: 8 });
    await expect(profesoresService.createProfesor(datos)).rejects.toMatchObject({ statusCode: 409 });
    await expect(profesoresService.updateProfesor(7, { rut: datos.rut })).rejects.toMatchObject({ statusCode: 409 });
    expect(profesoresRepository.create).not.toHaveBeenCalled();
    expect(profesoresRepository.updateWithSyncedUsuarioName).not.toHaveBeenCalled();
  });
  it("permite conservar el RUT propio con ceros iniciales y normaliza cambios", async () => {
    vi.mocked(profesoresRepository.findByRut).mockResolvedValue({ ...profesor, rut: "6000000-K" });
    await profesoresService.updateProfesor(7, { rut: "06000000k" });
    expect(profesoresRepository.updateWithSyncedUsuarioName).toHaveBeenCalledWith(7, { rut: "6000000-K" }, null);
    vi.mocked(profesoresRepository.findByRut).mockResolvedValue(undefined);
    await profesoresService.updateProfesor(7, { rut: "6.000.000-k" });
    expect(profesoresRepository.updateWithSyncedUsuarioName).toHaveBeenLastCalledWith(7, { rut: "6000000-K" }, null);
  });
  it("no modifica RUT en un update parcial", async () => {
    await profesoresService.updateProfesor(7, { nombre: "Cambio" });
    expect(profesoresRepository.findByRut).not.toHaveBeenCalled();
    expect(profesoresRepository.updateWithSyncedUsuarioName).toHaveBeenCalledWith(7, { nombre: "Cambio" }, null);
  });
  it.each([false, true])("mapea carrera de creación con acceso=%s", async (conAcceso) => {
    const metodo = conAcceso ? profesoresRepository.createWithUsuario : profesoresRepository.create;
    vi.mocked(metodo).mockRejectedValue({ cause: { cause: duplicado } });
    await expect(profesoresService.createProfesor({ ...datos, ...(conAcceso ? { acceso: { correo: "p@example.cl", clave: "123456" } } : {}) })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("mapea violación directa al actualizar", async () => {
    vi.mocked(profesoresRepository.updateWithSyncedUsuarioName).mockRejectedValue(duplicado);
    await expect(profesoresService.updateProfesor(7, { rut: datos.rut })).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each([
    { code: "23505", constraint_name: "usuarios_correo_unique" },
    { code: "23503", constraint_name: "profesores_rut_unique" },
    { code: "23505" }, new Error("profesores_rut_unique"),
  ])("no disfraza errores ajenos %s", async (error) => {
    vi.mocked(profesoresRepository.create).mockRejectedValue(error);
    vi.mocked(profesoresRepository.updateWithSyncedUsuarioName).mockRejectedValue({ cause: error });
    await expect(profesoresService.createProfesor(datos)).rejects.toBe(error);
    await expect(profesoresService.updateProfesor(7, { rut: datos.rut })).rejects.toEqual({ cause: error });
  });
});
