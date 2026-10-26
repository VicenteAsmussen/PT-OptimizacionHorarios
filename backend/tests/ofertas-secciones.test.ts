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

const datos = { asignaturaCodigo: "INF100", asignaciones: [{ tipoHoraId: 1, profesorId: 7 }], planificacionSemestreId: 3, seccion: 1, cupos: 0 };
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

  it("conserva sección por defecto, actualización parcial, asignaciones opcionales y cupos no negativos", () => {
    const { seccion, asignaciones, ...sinProfesor } = datos;
    expect(createOfertaValidation.parse({ ...sinProfesor, asignaciones }).seccion).toBe(1);
    expect(updateOfertaValidation.parse({ cupos: 5 })).toEqual({ cupos: 5 });
    expect(createOfertaValidation.parse(sinProfesor).asignaciones).toEqual([]);
    for (const valor of [null, 0, -1, 1.5]) {
      expect(createOfertaValidation.safeParse({ ...datos, asignaciones: [{ tipoHoraId: 1, profesorId: valor }] }).success).toBe(false);
      expect(updateOfertaValidation.safeParse({ asignaciones: [{ tipoHoraId: 1, profesorId: valor }] }).success).toBe(false);
    }
    expect(createOfertaValidation.safeParse({ ...datos, cupos: -1 }).success).toBe(false);
    expect(updateOfertaValidation.safeParse({ cupos: -1 }).success).toBe(false);
  });
});

function simularGuardiaBorrado() {
  const filaOferta = [9, "INF100", 3, 1, 0];
  const planificacion = [3, 1, "2027-1", true, "preparacion"];
  respuestas.push([filaOferta], [planificacion], [[1]], [planificacion], [filaOferta]);
}

function simularOferta() {
  vi.spyOn(ofertasRepository, "findById").mockResolvedValue(oferta as any);
  vi.spyOn(ofertasRepository, "checkAsignaturaExists").mockResolvedValue(true);
  vi.spyOn(ofertasRepository, "checkProfesorExists").mockResolvedValue(true);
  vi.spyOn(ofertasRepository, "checkProfesorDepartamento").mockResolvedValue(true);
  vi.spyOn(ofertasRepository, "findTiposAsignatura").mockResolvedValue([{ asignaturaCodigo: "INF100", tipoHoraId: 1, horas: 4 }]);
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
    expect(actualizar).toHaveBeenCalledWith(9, { cupos: 10 }, 3);
  });

  it("permite profesores del departamento de la asignatura aunque no sean gestionados por la carrera", async () => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create").mockResolvedValue(oferta);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(oferta);
    const asignaciones = [{ tipoHoraId: 1, profesorId: 99 }];
    await ofertasService.createOferta({ ...datos, asignaciones }, alcance);
    await ofertasService.updateOferta(9, { asignaciones }, alcance);
    expect(ofertasRepository.checkProfesorExists).toHaveBeenCalledWith(99);
    expect(ofertasRepository.checkProfesorDepartamento).toHaveBeenCalledWith(99, datos.asignaturaCodigo);
    expect(crear).toHaveBeenCalledWith({ ...datos, asignaciones });
    expect(actualizar).toHaveBeenCalledWith(9, { asignaciones }, 3);
  });

  it.each([undefined, alcance])("rechaza profesores de otro departamento al crear y editar sin escribir, alcance %j", async (alcanceUsuario) => {
    simularOferta();
    vi.mocked(ofertasRepository.checkProfesorDepartamento).mockResolvedValue(false);
    const crear = vi.spyOn(ofertasRepository, "create").mockResolvedValue(oferta);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(oferta);
    const asignaciones = [{ tipoHoraId: 1, profesorId: 99 }];
    await expect(ofertasService.createOferta({ ...datos, asignaciones }, alcanceUsuario))
      .rejects.toMatchObject({ statusCode: 400, message: "El profesor con ID 99 no pertenece al departamento de la asignatura" });
    await expect(ofertasService.updateOferta(9, { asignaciones }, alcanceUsuario))
      .rejects.toMatchObject({ statusCode: 400, message: "El profesor con ID 99 no pertenece al departamento de la asignatura" });
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("valida todos los tipos contra la asignatura efectiva y las asignaciones conservadas", async () => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create").mockResolvedValue(oferta);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(oferta);
    vi.mocked(ofertasRepository.findTiposAsignatura).mockResolvedValue([
      { asignaturaCodigo: "INF100", tipoHoraId: 1, horas: 4 },
      { asignaturaCodigo: "INF100", tipoHoraId: 2, horas: 2 },
    ]);
    vi.mocked(ofertasRepository.checkProfesorDepartamento).mockImplementation(async (id, codigo) => id === 7 && codigo === "INF100");
    const asignaciones = [{ tipoHoraId: 1, profesorId: 7 }, { tipoHoraId: 2, profesorId: 99 }];
    await expect(ofertasService.createOferta({ ...datos, asignaciones }, alcance)).rejects.toMatchObject({ statusCode: 400 });
    await expect(ofertasService.updateOferta(9, { asignaciones }, alcance)).rejects.toMatchObject({ statusCode: 400 });
    await expect(ofertasService.updateOferta(9, { asignaturaCodigo: "MAT100" }, alcance)).rejects.toMatchObject({ statusCode: 400 });
    expect(ofertasRepository.checkProfesorDepartamento).toHaveBeenLastCalledWith(7, "MAT100");
    vi.mocked(ofertasRepository.findById).mockResolvedValue({ ...oferta, asignaciones } as never);
    await expect(ofertasService.updateOferta(9, { cupos: 10 }, alcance)).rejects.toMatchObject({ statusCode: 400 });
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("permite secciones pendientes y quitar asignaciones sin consultar departamentos", async () => {
    simularOferta();
    const crear = vi.spyOn(ofertasRepository, "create").mockResolvedValue(oferta);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(oferta);
    await ofertasService.createOferta({ ...datos, asignaciones: [] }, alcance);
    await ofertasService.updateOferta(9, { asignaciones: [] }, alcance);
    expect(crear).toHaveBeenCalledWith({ ...datos, asignaciones: [] });
    expect(actualizar).toHaveBeenCalledWith(9, { asignaciones: [] }, 3);
    expect(ofertasRepository.checkProfesorExists).not.toHaveBeenCalled();
    expect(ofertasRepository.checkProfesorDepartamento).not.toHaveBeenCalled();
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
    await expect(ofertasService.createOferta({ ...datos, asignaciones: [{ tipoHoraId: 1, profesorId: 99 }] }, alcanceUsuario))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(ofertasService.updateOferta(9, { asignaciones: [{ tipoHoraId: 1, profesorId: 99 }] }, alcanceUsuario))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("visibilidad, edición y borrado dependen de la asignatura, no del profesor externo", async () => {
    simularOferta();
    const externa = { ...oferta, asignaciones: [{ tipoHoraId: 1, profesorId: 99 }] };
    vi.mocked(ofertasRepository.findById).mockResolvedValue(externa as never);
    const actualizar = vi.spyOn(ofertasRepository, "update").mockResolvedValue(externa);
    const eliminar = vi.spyOn(ofertasRepository, "delete").mockResolvedValue(true);
    await expect(ofertasService.getOfertaById(9, alcance)).resolves.toEqual(externa);
    await ofertasService.updateOferta(9, { cupos: 10 }, alcance);
    await ofertasService.deleteOferta(9, alcance);
    expect(actualizar).toHaveBeenCalledWith(9, { cupos: 10 }, 3);
    expect(eliminar).toHaveBeenCalledWith(9, 3);

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
    simularGuardiaBorrado();
    respuestas.push([[9]], [[20]]);
    await expect(ofertasService.deleteOferta(9, alcance)).rejects.toBeInstanceOf(ConflictError);
    expect(consultas.some(({ sql }) => /delete/i.test(sql))).toBe(false);
  });

  it("permite borrar una oferta vacía autorizada y rechaza una inexistente", async () => {
    simularOferta();
    simularGuardiaBorrado();
    respuestas.push([[9]], [], [[9]]);
    await expect(ofertasService.deleteOferta(9, alcance)).resolves.toBeUndefined();
    expect(consultas.at(-1)?.sql).toContain('delete from "ofertas_asignaturas"');
    vi.mocked(ofertasRepository.findById).mockResolvedValue(undefined);
    const eliminar = vi.spyOn(ofertasRepository, "delete");
    await expect(ofertasService.deleteOferta(404, alcance)).rejects.toMatchObject({ statusCode: 404 });
    expect(eliminar).not.toHaveBeenCalled();
  });
});

describe("Departamento del profesor para una asignatura", () => {
  it("compara departamentos y restringe por profesor y código sin modificar datos", async () => {
    respuestas.push([[7]], []);
    await expect(ofertasRepository.checkProfesorDepartamento(7, "INF100")).resolves.toBe(true);
    await expect(ofertasRepository.checkProfesorDepartamento(99, "INF100")).resolves.toBe(false);
    expect(consultas).toHaveLength(2);
    for (const consulta of consultas) {
      expect(consulta.sql).toContain('inner join "asignaturas"');
      expect(consulta.sql).toContain('"asignaturas"."departamento_id" = "profesores"."departamento_id"');
      expect(consulta.sql).toContain('"profesores"."id" = $1');
      expect(consulta.sql).toContain('"asignaturas"."codigo" = $2');
      expect(consulta.parametros.slice(1, 2)).toEqual(["INF100"]);
      expect(consulta.sql).not.toMatch(/insert|update|delete/i);
    }
    expect(consultas.map(consulta => consulta.parametros[0])).toEqual([7, 99]);
  });
});

describe("Contrato SQL de borrado seguro", () => {
  it("bloquea la oferta antes de comprobar horarios y rechaza sin ejecutar DELETE", async () => {
    simularGuardiaBorrado();
    respuestas.push([[9]], [[20]]);
    await expect(ofertasRepository.delete(9)).rejects.toMatchObject({ statusCode: 409 });
    expect(transaccion).toHaveBeenCalledTimes(1);
    expect(transaccion.mock.calls[0][1]).toEqual({ isolationLevel: "read committed" });
    expect(consultas).toHaveLength(7);
    expect(consultas[2].sql).toContain('from "carreras"');
    expect(consultas[2].sql).toContain("for update");
    expect(consultas[5].sql).toContain('from "ofertas_asignaturas"');
    expect(consultas[5].sql).toContain("for update");
    expect(consultas[5].parametros).toContain(9);
    expect(consultas[6].sql).toContain('from "horarios_asignaturas"');
    expect(consultas[6].sql).toContain('"horarios_asignaturas"."oferta_id" = $1');
    expect(consultas[6].parametros).toContain(9);
    expect(consultas.some(({ sql }) => /delete/i.test(sql))).toBe(false);
  });

  it("elimina una oferta sin horarios dentro de la misma transacción", async () => {
    simularGuardiaBorrado();
    respuestas.push([[9]], [], [[9]]);
    expect(await ofertasRepository.delete(9)).toBe(true);
    expect(transaccion).toHaveBeenCalledTimes(1);
    expect(consultas).toHaveLength(8);
    expect(consultas[5].sql).toContain("for update");
    expect(consultas[6].sql).toContain('from "horarios_asignaturas"');
    expect(consultas[7].sql).toContain('delete from "ofertas_asignaturas"');
    expect(consultas[7].parametros).toEqual([9]);
  });

  it("no consulta dependencias ni borra si la oferta ya no existe", async () => {
    respuestas.push([]);
    await expect(ofertasRepository.delete(404)).rejects.toMatchObject({ statusCode: 404 });
    expect(consultas).toHaveLength(1);
    expect(consultas[0].sql).toContain('from "ofertas_asignaturas"');
  });

  it("propaga fallos de consulta sin continuar al borrado", async () => {
    respuestas.push([[9]], new Error("Fallo de consulta"));
    await expect(ofertasRepository.delete(9)).rejects.toThrow();
    expect(consultas).toHaveLength(2);
    expect(consultas.some(({ sql }) => /delete/i.test(sql))).toBe(false);
  });
});
