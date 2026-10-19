import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOfertaValidation, updateOfertaValidation } from "../src/validations/ofertas.validation.js";
import { ConflictError } from "../src/utils/errors.js";
import type { AlcanceCarrera } from "../src/utils/alcance-carrera.js";

const { consultas, respuestas, transaccion } = vi.hoisted(() => ({
  consultas: [] as { sql: string; parametros: unknown[] }[],
  respuestas: [] as (unknown[][] | Error)[],
  transaccion: vi.fn(),
}));
// Construye SQL real, pero no carga el controlador ni se conecta a PostgreSQL.
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const esquema = await import("../src/db/schema/index.js");
  const baseDatos = drizzle(async (sql, parametros) => {
    consultas.push({ sql, parametros });
    const respuesta = respuestas.shift() ?? [];
    if (respuesta instanceof Error) throw respuesta;
    return { rows: respuesta };
  }, { schema: esquema });
  baseDatos.transaction = transaccion.mockImplementation(async (operacion) => operacion(baseDatos));
  return { db: baseDatos };
});
import { ofertasRepository } from "../src/repositories/ofertas.repository.js";
import { ofertasService } from "../src/services/ofertas.service.js";
import { planificacionesSemestresService } from "../src/services/planificaciones-semestres.service.js";

const datos = { asignaturaCodigo: "INF100", profesorId: 7, planificacionSemestreId: 3, seccion: 1, cupos: 0 };
const oferta = { id: 9, ...datos, planificacionSemestre: { carreraId: 1 }, horarios: [] };
const alcance: AlcanceCarrera = {
  carreraId: 1, asignaturasCodigos: [datos.asignaturaCodigo], profesoresIds: [7, 8],
  departamentosIds: [4, 5], departamentosGestionadosIds: [4], ofertasIds: [9],
};

beforeEach(() => {
  vi.restoreAllMocks();
  consultas.length = 0;
  respuestas.length = 0;
  transaccion.mockClear();
});

describe("Secciones de ofertas (sin base de datos)", () => {
  it.each([1, 2, 3, 4, 5])("acepta sección %s en creación y actualización", (seccion) => {
    expect(createOfertaValidation.parse({ ...datos, seccion }).seccion).toBe(seccion);
    expect(updateOfertaValidation.parse({ seccion })).toEqual({ seccion });
  });

  it.each([0, -1, 6, 100, 1.5, "2", null])("rechaza sección %s en ambas operaciones", (seccion) => {
    expect(createOfertaValidation.safeParse({ ...datos, seccion }).success).toBe(false);
    expect(updateOfertaValidation.safeParse({ seccion }).success).toBe(false);
  });

  it("conserva sección por defecto, actualización parcial, profesor obligatorio y cupos no negativos", () => {
    const { seccion, profesorId, ...sinProfesor } = datos;
    expect(createOfertaValidation.parse({ ...sinProfesor, profesorId }).seccion).toBe(1);
    expect(updateOfertaValidation.parse({ cupos: 5 })).toEqual({ cupos: 5 });
    expect(createOfertaValidation.safeParse(sinProfesor).success).toBe(false);
    for (const valor of [null, 0, -1, 1.5]) {
      expect(createOfertaValidation.safeParse({ ...datos, profesorId: valor }).success).toBe(false);
      expect(updateOfertaValidation.safeParse({ profesorId: valor }).success).toBe(false);
    }
    expect(createOfertaValidation.safeParse({ ...datos, cupos: -1 }).success).toBe(false);
    expect(updateOfertaValidation.safeParse({ cupos: -1 }).success).toBe(false);
  });
});

function simularOferta() {
  vi.spyOn(ofertasRepository, "findById").mockResolvedValue(oferta as any);
  vi.spyOn(ofertasRepository, "checkAsignaturaExists").mockResolvedValue(true);
  vi.spyOn(ofertasRepository, "checkProfesorExists").mockResolvedValue(true);
  vi.spyOn(planificacionesSemestresService, "exigirAsignatura").mockResolvedValue({ id: 3, carreraId: 1 } as never);
  vi.spyOn(ofertasRepository, "findByUniqueConstraint").mockResolvedValue(undefined);
}

describe("Reglas del servicio de ofertas", () => {
  it("rechaza duplicados en creación y al cambiar sección, sin escribir", async () => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create");
    const actualizar = vi.spyOn(ofertasRepository, "update");
    vi.mocked(ofertasRepository.findByUniqueConstraint).mockResolvedValue({ ...oferta, id: 10 });
    await expect(ofertasService.createOferta(datos, alcance)).rejects.toMatchObject({ statusCode: 409 });
    await expect(ofertasService.updateOferta(9, { seccion: 2 }, alcance)).rejects.toThrow("Ya existe esta sección");
    expect(ofertasRepository.findByUniqueConstraint).toHaveBeenLastCalledWith("INF100", 3, 2);
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("distingue semestres y permite actualizar la oferta sin cambiar su clave", async () => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create").mockResolvedValue(oferta);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(oferta);
    await ofertasService.createOferta({ ...datos, planificacionSemestreId: 4 }, alcance);
    expect(ofertasRepository.findByUniqueConstraint).toHaveBeenCalledWith("INF100", 4, 1);
    expect(crear).toHaveBeenCalledWith({ ...datos, planificacionSemestreId: 4 });
    vi.mocked(ofertasRepository.findByUniqueConstraint).mockClear();
    await ofertasService.updateOferta(9, { cupos: 10 }, alcance);
    expect(ofertasRepository.findByUniqueConstraint).toHaveBeenCalledWith("INF100", 3, 1);
    expect(actualizar).toHaveBeenCalledWith(9, { cupos: 10 });
  });

  it("permite cualquier profesor existente fuera de los departamentos de la carrera", async () => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create").mockResolvedValue(oferta);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(oferta);
    await ofertasService.createOferta({ ...datos, profesorId: 99 }, alcance);
    await ofertasService.updateOferta(9, { profesorId: 99 }, alcance);
    expect(ofertasRepository.checkProfesorExists).toHaveBeenCalledWith(99);
    expect(crear).toHaveBeenCalledWith({ ...datos, profesorId: 99 });
    expect(actualizar).toHaveBeenCalledWith(9, { profesorId: 99 });
  });

  it("conserva rechazo de asignaturas fuera del alcance sin escribir", async () => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create");
    const actualizar = vi.spyOn(ofertasRepository, "update");
    const eliminar = vi.spyOn(ofertasRepository, "delete");
    vi.mocked(planificacionesSemestresService.exigirAsignatura).mockRejectedValue(Object.assign(new Error("Asignatura fuera de la carrera"), { statusCode: 403 }));
    await expect(ofertasService.createOferta({ ...datos, asignaturaCodigo: "OTRA" }, alcance))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(ofertasService.updateOferta(9, { asignaturaCodigo: "OTRA" }, alcance))
      .rejects.toMatchObject({ statusCode: 403 });
    const sinAsignaturas = { ...alcance, carreraId: 2, asignaturasCodigos: [] };
    await expect(ofertasService.updateOferta(9, {}, sinAsignaturas)).rejects.toMatchObject({ statusCode: 404 });
    await expect(ofertasService.deleteOferta(9, sinAsignaturas)).rejects.toMatchObject({ statusCode: 404 });
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
    expect(eliminar).not.toHaveBeenCalled();
  });

  it.each([undefined, alcance])("rechaza profesores inexistentes con alcance %j", async (alcanceUsuario) => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create");
    const actualizar = vi.spyOn(ofertasRepository, "update");
    vi.mocked(ofertasRepository.checkProfesorExists).mockResolvedValue(false);
    await expect(ofertasService.createOferta({ ...datos, profesorId: 99 }, alcanceUsuario))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(ofertasService.updateOferta(9, { profesorId: 99 }, alcanceUsuario))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("visibilidad, edición y borrado dependen de la asignatura, no del profesor externo", async () => {
    simularOferta();
    const externa = { ...oferta, profesorId: 99 };
    vi.mocked(ofertasRepository.findById).mockResolvedValue(externa as never);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(externa);
    const eliminar = vi.spyOn(ofertasRepository, "delete").mockResolvedValue(true);
    await expect(ofertasService.getOfertaById(9, alcance)).resolves.toEqual(externa);
    await ofertasService.updateOferta(9, { cupos: 10 }, alcance);
    await ofertasService.deleteOferta(9, alcance);
    expect(actualizar).toHaveBeenCalledWith(9, { cupos: 10 });
    expect(eliminar).toHaveBeenCalledWith(9);

    actualizar.mockClear();
    eliminar.mockClear();
    const otraCarrera = { ...alcance, carreraId: 2, asignaturasCodigos: [] };
    await expect(ofertasService.getOfertaById(9, otraCarrera)).rejects.toMatchObject({ statusCode: 404 });
    await expect(ofertasService.updateOferta(9, { cupos: 10 }, otraCarrera)).rejects.toMatchObject({ statusCode: 404 });
    await expect(ofertasService.deleteOferta(9, otraCarrera)).rejects.toMatchObject({ statusCode: 404 });
    expect(actualizar).not.toHaveBeenCalled();
    expect(eliminar).not.toHaveBeenCalled();
  });

  it("propaga conflicto de borrado como error de dominio 409", async () => {
    simularOferta();
    respuestas.push([[9]], [[20]]);
    await expect(ofertasService.deleteOferta(9, alcance)).rejects.toBeInstanceOf(ConflictError);
    expect(consultas.some(({ sql }) => /delete/i.test(sql))).toBe(false);
  });

  it("permite borrar una oferta vacía autorizada y rechaza una inexistente", async () => {
    simularOferta();
    respuestas.push([[9]], [], [[9]]);
    await expect(ofertasService.deleteOferta(9, alcance)).resolves.toBeUndefined();
    expect(consultas.at(-1)?.sql).toContain('delete from "ofertas_asignaturas"');
    vi.mocked(ofertasRepository.findById).mockResolvedValue(undefined);
    const eliminar = vi.spyOn(ofertasRepository, "delete");
    await expect(ofertasService.deleteOferta(404, alcance)).rejects.toMatchObject({ statusCode: 404 });
    expect(eliminar).not.toHaveBeenCalled();
  });
});

describe("Contrato SQL de borrado seguro", () => {
  it("bloquea la oferta antes de comprobar horarios y rechaza sin ejecutar DELETE", async () => {
    respuestas.push([[9]], [[20]]);
    await expect(ofertasRepository.delete(9)).rejects.toMatchObject({ statusCode: 409 });
    expect(transaccion).toHaveBeenCalledTimes(1);
    expect(transaccion.mock.calls[0][1]).toEqual({ isolationLevel: "read committed" });
    expect(consultas).toHaveLength(2);
    expect(consultas[0].sql).toContain('from "ofertas_asignaturas"');
    expect(consultas[0].sql).toContain("for update");
    expect(consultas[0].parametros).toContain(9);
    expect(consultas[1].sql).toContain('from "horarios_asignaturas"');
    expect(consultas[1].sql).toContain('"horarios_asignaturas"."oferta_id" = $1');
    expect(consultas[1].parametros).toContain(9);
    expect(consultas.some(({ sql }) => /delete/i.test(sql))).toBe(false);
  });

  it("elimina una oferta sin horarios dentro de la misma transacción", async () => {
    respuestas.push([[9]], [], [[9]]);
    expect(await ofertasRepository.delete(9)).toBe(true);
    expect(transaccion).toHaveBeenCalledTimes(1);
    expect(consultas).toHaveLength(3);
    expect(consultas[0].sql).toContain("for update");
    expect(consultas[1].sql).toContain('from "horarios_asignaturas"');
    expect(consultas[2].sql).toContain('delete from "ofertas_asignaturas"');
    expect(consultas[2].parametros).toEqual([9]);
  });

  it("no consulta dependencias ni borra si la oferta ya no existe", async () => {
    respuestas.push([]);
    expect(await ofertasRepository.delete(404)).toBe(false);
    expect(consultas).toHaveLength(1);
    expect(consultas[0].sql).toContain("for update");
  });

  it("propaga fallos de consulta sin continuar al borrado", async () => {
    respuestas.push([[9]], new Error("Fallo de consulta"));
    await expect(ofertasRepository.delete(9)).rejects.toThrow();
    expect(consultas).toHaveLength(2);
    expect(consultas.some(({ sql }) => /delete/i.test(sql))).toBe(false);
  });
});
