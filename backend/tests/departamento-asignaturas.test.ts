import { describe, expect, it, vi } from "vitest";
import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm";
import * as esquema from "../src/db/schema/index.js";
import { datosAsignaturas, datosDepartamentos, datosCarreras } from "../src/db/seeds/data/academico.js";
import { getTableConfig } from "drizzle-orm/pg-core";
import { asignaturas } from "../src/db/schema/asignaturas.schema.js";
import { createAsignaturaValidation, updateAsignaturaValidation } from "../src/validations/asignaturas.validation.js";
import { asignaturasRepository } from "../src/repositories/asignaturas.repository.js";

vi.mock("../src/config/db.js", () => ({ db: { query: { asignaturas: { findMany: vi.fn(), findFirst: vi.fn() } } } }));
import { db } from "../src/config/db.js";

const datos = { codigo: "INF100", nombre: "Programación", semestreMalla: 1 };
describe("contrato departamento-asignaturas sin base de datos", () => {
  it.each([undefined, null, 0, -1, 1.5, "1"])("rechaza departamentoId inválido en creación: %s", (departamentoId) => {
    expect(createAsignaturaValidation.safeParse({ ...datos, departamentoId }).success).toBe(false);
  });
  it("permite actualización parcial pero no quitar el departamento", () => {
    expect(updateAsignaturaValidation.safeParse({ nombre: "Otro" }).success).toBe(true);
    expect(updateAsignaturaValidation.safeParse({ departamentoId: 2 }).success).toBe(true);
    expect(updateAsignaturaValidation.safeParse({ departamentoId: null }).success).toBe(false);
    expect(createAsignaturaValidation.safeParse({ ...datos, departamentoId: 1 }).success).toBe(true);
  });
  it("expone relaciones inversas y asignaciones explícitas del seed", () => {
    const { tables } = extractTablesRelationalConfig(esquema, createTableRelationsHelpers);
    expect(tables.asignaturas.relations.departamento.referencedTableName).toBe("departamentos");
    expect(tables.departamentos.relations.asignaturas.referencedTableName).toBe("asignaturas");
    expect(new Set(datosAsignaturas.map((dato) => dato.codigo)).size).toBe(datosAsignaturas.length);
    for (const dato of datosAsignaturas) {
      expect(datosDepartamentos.some((departamento) => departamento.nombre === dato.departamento)).toBe(true);
      expect(dato.carreras.every((nombre) => datosCarreras.some((carrera) => carrera.nombre === nombre))).toBe(true);
    }
  });
  it("declara una FK obligatoria con borrado restrictivo", () => {
    expect(asignaturas.departamentoId.notNull).toBe(true);
    const clave = getTableConfig(asignaturas).foreignKeys.find((fk) => fk.reference().columns.includes(asignaturas.departamentoId));
    expect(clave?.onDelete).toBe("restrict");
    expect(clave?.reference().foreignColumns[0].name).toBe("id");
  });
  it("combina el filtro con el alcance e incluye departamento en respuestas", async () => {
    await asignaturasRepository.findAll({ carreraId: 1, asignaturasCodigos: ["LOCAL"], departamentosIds: [], profesoresIds: [], ofertasIds: [] }, 5);
    const consulta = vi.mocked(db.query.asignaturas.findMany).mock.calls.at(-1)![0]!;
    expect(consulta.with).toMatchObject({ departamento: true });
    // Ambos predicados deben existir; el filtro no concede acceso a otra carrera.
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const sql = new PgDialect().sqlToQuery(consulta.where as never);
    expect(sql.sql).toContain('"asignaturas"."codigo" in');
    expect(sql.sql).toContain('"asignaturas"."departamento_id" =');
    expect(sql.params).toEqual(["LOCAL", 5]);
    await asignaturasRepository.findByCodigo("LOCAL");
    expect(vi.mocked(db.query.asignaturas.findFirst).mock.calls.at(-1)![0]!.with).toMatchObject({ departamento: true });
  });
});
