import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
import * as schema from "../src/db/schema/index.js";
import { createHorarioValidation, updateHorarioValidation } from "../src/validations/horarios.validation.js";
import { createPlanificacionSemestreValidation, updatePlanificacionSemestreValidation } from "../src/validations/planificaciones-semestres.validation.js";

const { statements, responses, transaction } = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  responses: [] as (unknown[][] | Error)[], transaction: vi.fn(),
}));
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("../src/db/schema/index.js");
  const db = drizzle(async (sql, params) => {
    statements.push({ sql, params });
    const response = responses.shift() ?? [];
    if (response instanceof Error) throw response;
    return { rows: response };
  }, { schema });
  db.transaction = transaction.mockImplementation(async fn => fn(db));
  return { db };
});
import { planificacionesSemestresRepository } from "../src/repositories/planificaciones-semestres.repository.js";
import { planificacionesSemestresService } from "../src/services/planificaciones-semestres.service.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { horariosService } from "../src/services/horarios.service.js";

const entry = { ofertaId: 2, salaId: null, bloqueId: 3, tipoHoraId: 4, planificacionSemestreId: 7 };
const entryRow = [12, 2, null, 3, 4, 7];
beforeEach(() => { statements.length = 0; responses.length = 0; transaction.mockClear(); });
afterEach(() => vi.restoreAllMocks());
function simularGuardia(lecturas: unknown[][][], ids = [7]) {
  const planificaciones = ids.map(id => [id, 1, "2027-1", true, "preparacion"]);
  responses.push(...lecturas, ...planificaciones.map(fila => [fila]), [[1]], ...planificaciones.map(fila => [fila]), ...lecturas);
}
const ofertaRow = [2, "INF100", 7, 1, 30];

describe("Publicación única por planificación (offline)", () => {
  it("no exporta entidad legacy ni agregado ni publicación por entrada", () => {
    for (const nombre of ["semestres", "semestresHorarios", "horarios"]) expect(schema).not.toHaveProperty(nombre);
    const entradas = getTableConfig(schema.horariosAsignaturas);
    expect(entradas.columns.map(c => c.name)).not.toContain("horario_publicado");
    expect(entradas.columns.find(c => c.name === "sala_id")?.notNull).toBe(false);
    expect(entradas.columns.find(c => c.name === "planificacion_semestre_id")?.notNull).toBe(true);
    expect(schema.planificacionesSemestres.estadoPlanificacion.default).toBe("preparacion");
  });
  it("rechaza publicación en CRUD y estados en PATCH genérico", () => {
    expect(createHorarioValidation.parse(entry)).toEqual(entry);
    for (const horarioPublicado of [true, false, "true"]) {
      expect(createHorarioValidation.safeParse({ ...entry, horarioPublicado }).success).toBe(false);
      expect(updateHorarioValidation.safeParse({ horarioPublicado }).success).toBe(false);
    }
    expect(updateHorarioValidation.parse({})).toEqual({});
    expect(createHorarioValidation.safeParse({ ...entry, semestreId: 7 }).success).toBe(false);
    for (const estadoPlanificacion of ["preparacion", "propuesta", "publicado"]) {
      expect(createPlanificacionSemestreValidation.safeParse({ carreraId: 1, codigo: "2027-1", estadoPlanificacion }).success).toBe(false);
      expect(updatePlanificacionSemestreValidation.safeParse({ estadoPlanificacion }).success).toBe(false);
    }
  });
  it("crea entrada con sala null sin relación secundaria", async () => {
    simularGuardia([[ofertaRow]]);
    responses.push([[2, 4, 5]], [], [entryRow]);
    expect(await horariosRepository.create(entry)).toEqual({ id: 12, ...entry });
    expect(statements.at(-1)!.sql).toContain('insert into "horarios_asignaturas"');
    expect(statements.at(-1)!.params).toEqual([2, null, 3, 4, 7]);
    expect(transaction).toHaveBeenCalledOnce();
  });
  it("propaga fallo de inserción", async () => {
    simularGuardia([[ofertaRow]]);
    responses.push([[2, 4, 5]], [], new Error("fallo entrada"));
    await expect(horariosRepository.create(entry)).rejects.toMatchObject({ cause: { message: "fallo entrada" } });
  });
  it("actualiza contexto y sala sin escribir publicación", async () => {
    simularGuardia([[entryRow], [[2, "INF100", 8, 1, 30]]], [7, 8]);
    responses.push([entryRow], [[2, 4, 5]], [], [[12, 2, null, 3, 4, 8]]);
    expect(await horariosRepository.update(12, { planificacionSemestreId: 8, salaId: null })).toEqual({ id: 12, ...entry, planificacionSemestreId: 8 });
    expect(statements.at(-1)!.sql).toContain('update "horarios_asignaturas"');
    expect(statements.every(({ sql }) => !sql.includes("horario_publicado"))).toBe(true);
  });
  it("rechaza actualizar entrada inexistente sin escribir", async () => {
    await expect(horariosRepository.update(404, { salaId: null })).rejects.toMatchObject({ statusCode: 404 });
    expect(statements).toHaveLength(1);
  });
  it("lee estado a través de planificación, sin proyección legacy", async () => {
    await horariosRepository.findAll({ planificacionSemestreId: 7 });
    await horariosRepository.findById(12);
    for (const { sql } of statements) {
      expect(sql).toContain("estado_planificacion");
      expect(sql).not.toContain("semestres_horarios");
      expect(sql).not.toContain("horario_publicado");
    }
  });
  it("crea planificación vacía sin horarios y conserva preparacion", async () => {
    responses.push([[1]], [], [], [[7, 1, "2027-1", true, "preparacion"]]);
    expect(await planificacionesSemestresRepository.create({ carreraId: 1, codigo: "2027-1" })).toEqual({ id: 7, carreraId: 1, codigo: "2027-1", actual: true, estadoPlanificacion: "preparacion" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(statements).toHaveLength(4);
    expect(statements[0].sql).toContain("for update");
    expect(statements[0].params).toEqual([1]);
    expect(statements[1].sql).toContain('from "planificaciones_semestres"');
    expect(statements[1].params).toEqual([1, "2027-1", 1]);
    expect(statements[2].sql).toContain('update "planificaciones_semestres" set "actual" = $1 where "planificaciones_semestres"."carrera_id" = $2');
    expect(statements[2].params).toEqual([false, 1]);
    expect(statements[3].sql).toContain('insert into "planificaciones_semestres"');
    expect(statements[3].params).toEqual([1, "2027-1", true, "preparacion"]);
  });
  it("no escribe ni desactiva períodos si la carrera no existe", async () => {
    responses.push([]);
    await expect(planificacionesSemestresRepository.create({ carreraId: 404, codigo: "2027-1" })).rejects.toMatchObject({ statusCode: 404, message: "Carrera no encontrada" });
    expect(statements).toHaveLength(1);
    expect(statements[0].params).toEqual([404]);
  });
  it("checks career/code after its lock and rejects before demotion/insertion", async () => {
    responses.push([[1]], [[7]]);
    await expect(planificacionesSemestresRepository.create({ carreraId: 1, codigo: "2027-1" })).rejects.toMatchObject({ statusCode: 409, message: "Período existente" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain('from "carreras"');
    expect(statements[0].sql).toContain("for update");
    expect(statements[0].params).toEqual([1]);
    expect(statements[1].sql).toContain('from "planificaciones_semestres"');
    expect(statements[1].sql).toContain('("planificaciones_semestres"."carrera_id" = $1 and "planificaciones_semestres"."codigo" = $2)');
    expect(statements[1].params).toEqual([1, "2027-1", 1]);
    expect(statements.every(({ sql }) => sql.startsWith("select "))).toBe(true);
  });
  it("borrar entrada no reabre la planificación", async () => {
    simularGuardia([[entryRow]]);
    responses.push([entryRow]);
    expect(await horariosRepository.delete(12)).toBe(true);
    expect(statements.at(-1)!.sql).toContain('delete from "horarios_asignaturas"');
    expect(statements.some(({ sql }) => sql.startsWith('update "planificaciones_semestres"'))).toBe(false);
  });
  it("limita el reset de desarrollo de 0013 y elimina solo las tablas obsoletas", () => {
    const dir = new URL("../src/db/migrations/", import.meta.url);
    const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8"));
    const migration = journal.entries.find((entrada: { idx: number }) => entrada.idx === 13);
    expect(migration).toBeDefined();
    const sql = readFileSync(new URL(`${migration.tag}.sql`, dir), "utf8");
    const sentencias = sql.replace(/--[^\n]*/g, "").split(";").map(texto => texto.trim()).filter(Boolean);
    const tablasReset = ["semestres_horarios", "horarios_asignaturas", "ofertas_asignaturas", "disponibilidad_profesores"];
    expect(sentencias.slice(0, 4)).toEqual(tablasReset.map(nombre => `DELETE FROM "${nombre}"`));
    expect(sentencias.filter(texto => /^DELETE\b/i.test(texto))).toEqual(sentencias.slice(0, 4));
    expect(sql).not.toMatch(/\bTRUNCATE\b|\bDROP\s+(?:DATABASE|SCHEMA)\b|\bRENAME\b/i);
    expect(sentencias.filter(texto => /^DROP TABLE\b/i.test(texto))).toEqual([
      'DROP TABLE "semestres_horarios"', 'DROP TABLE "semestres"',
    ]);
    expect(sql).not.toMatch(/DROP TABLE[^;]*\bCASCADE\b/i);
    expect(sentencias.filter(texto => /DROP COLUMN/.test(texto)).sort()).toEqual([
      'ALTER TABLE "disponibilidad_profesores" DROP COLUMN "semestre_id"',
      'ALTER TABLE "horarios_asignaturas" DROP COLUMN "semestre_id"',
      'ALTER TABLE "ofertas_asignaturas" DROP COLUMN "semestre_id"',
    ]);
    const indiceUnicaOferta = sentencias.findIndex(texto => texto.includes('ADD CONSTRAINT "uq_ofertas_id_planificacion"'));
    const indiceFkOferta = sentencias.findIndex(texto => texto.includes('ADD CONSTRAINT "fk_horarios_oferta_planificacion"'));
    expect(indiceUnicaOferta).toBeGreaterThan(3);
    expect(indiceFkOferta).toBeGreaterThan(indiceUnicaOferta);
    expect(sentencias.indexOf('DROP TABLE "semestres_horarios"')).toBeLessThan(
      sentencias.indexOf('ALTER TABLE "horarios_asignaturas" DROP CONSTRAINT "uq_horarios_asignaturas_id_semestre"'),
    );
    expect(sql).toMatch(/desarrollo/i);
    expect(sql).toMatch(/seed/i);
    const indiceBorrado = sentencias.indexOf('DROP TABLE "semestres"');
    for (const tabla of ["ofertas_asignaturas", "horarios_asignaturas", "disponibilidad_profesores"]) {
      const anterior = JSON.parse(readFileSync(new URL("meta/0012_snapshot.json", dir), "utf8"));
      for (const fk of Object.values(anterior.tables[`public.${tabla}`].foreignKeys) as { name: string; tableTo: string }[]) {
        if (fk.tableTo === "semestres") {
          const indice = sentencias.indexOf(`ALTER TABLE "${tabla}" DROP CONSTRAINT "${fk.name}"`);
          expect(indice).toBeGreaterThanOrEqual(4);
          expect(indice).toBeLessThan(indiceBorrado);
        }
      }
    }
    const anterior = JSON.parse(readFileSync(new URL("meta/0012_snapshot.json", dir), "utf8"));
    const actual = JSON.parse(readFileSync(new URL("meta/0013_snapshot.json", dir), "utf8"));
    expect(actual.prevId).toBe(anterior.id);
    expect(actual.tables).not.toHaveProperty("public.semestres");
    expect(actual.tables).not.toHaveProperty("public.semestres_horarios");
    expect(actual.tables["public.planificaciones_semestres"]).toEqual(anterior.tables["public.planificaciones_semestres"]);
  });
  it("preserva migración histórica 0006 y su snapshot", () => {
    const dir = new URL("../src/db/migrations/", import.meta.url);
    const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8"));
    const migration = journal.entries.find((entry: { idx: number }) => entry.idx === 6);
    const sql = readFileSync(new URL(`${migration.tag}.sql`, dir), "utf8");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toMatch(/s\."horario_publicado"\s*=\s*true/i);
    expect(sql.indexOf("RAISE EXCEPTION")).toBeLessThan(sql.indexOf('CREATE TABLE "semestres_horarios"'));
    expect(sql.indexOf("RAISE EXCEPTION")).toBeLessThan(sql.indexOf('DROP COLUMN "horario_publicado"'));
    expect(sql.indexOf('UNIQUE("id","semestre_id")')).toBeLessThan(sql.indexOf('ADD CONSTRAINT "fk_semestres_horarios_entrada_semestre"'));
    expect(sql).toContain('WHERE e."semestre_id" = s."id"');
    expect(sql).toContain('ON DELETE cascade ON UPDATE cascade');
    expect(sql).toContain('SELECT e."semestre_id", e."id", s."horario_publicado"');
    expect(sql).toContain('FROM "horarios_asignaturas" e');
    expect(sql.indexOf('INSERT INTO "semestres_horarios"')).toBeLessThan(sql.indexOf('DROP COLUMN "horario_publicado"'));
    expect(sql).not.toMatch(/UPDATE "horarios_asignaturas"|DELETE FROM|TRUNCATE|DROP TABLE|ALTER COLUMN "sala_id"/i);
    expect(sql).not.toContain('CREATE TABLE "horarios"');
    const snapshot = JSON.parse(readFileSync(new URL("meta/0006_snapshot.json", dir), "utf8"));
    expect(snapshot.tables["public.horarios"]).toBeUndefined();
    expect(snapshot.tables["public.horarios_asignaturas"].columns.horario_id).toBeUndefined();
    expect(snapshot.tables["public.semestres"].columns.horario_publicado).toBeUndefined();
    expect(snapshot.tables["public.semestres_horarios"].columns.horario_asignatura_id.primaryKey).toBe(true);
    const previous = JSON.parse(readFileSync(new URL("meta/0005_snapshot.json", dir), "utf8"));
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.tables["public.horarios_asignaturas"].columns).toEqual(previous.tables["public.horarios_asignaturas"].columns);
    const ownership = snapshot.tables["public.semestres_horarios"].foreignKeys.fk_semestres_horarios_entrada_semestre;
    expect(ownership.columnsTo).toEqual(["id", "semestre_id"]);
    expect(ownership.onUpdate).toBe("cascade");
  });
});

describe("Sala nullable y consistencia de planificación", () => {
  function preparar() {
    const creada = { id: 12, ...entry };
    vi.spyOn(planificacionesSemestresService, "getById").mockResolvedValue({ id: 7, carreraId: 1 } as any);
    vi.spyOn(horariosRepository, "findOfertaWithDetails").mockResolvedValue({ planificacionSemestreId: 7, asignaciones: [{ tipoHoraId: 4, profesorId: 5 }] } as any);
    vi.spyOn(horariosRepository, "checkBloqueExists").mockResolvedValue(true);
    vi.spyOn(horariosRepository, "checkTipoHoraExists").mockResolvedValue(true);
    vi.spyOn(horariosRepository, "findByOfertaBloque").mockResolvedValue(undefined);
    vi.spyOn(horariosRepository, "findByProfesorBloquePlanificacion").mockResolvedValue(undefined);
    vi.spyOn(horariosRepository, "findById").mockResolvedValue(creada as any);
    return creada;
  }
  it("crea sin exigir sala", async () => {
    const creada = preparar();
    const sala = vi.spyOn(horariosRepository, "checkSalaExists");
    const crear = vi.spyOn(horariosRepository, "create").mockResolvedValue(creada);
    expect(await horariosService.createHorario(entry)).toEqual(creada);
    expect(crear).toHaveBeenCalledWith(entry);
    expect(sala).not.toHaveBeenCalled();
  });
  it("rechaza entrada para otra planificación antes de insertar", async () => {
    preparar();
    const crear = vi.spyOn(horariosRepository, "create");
    await expect(horariosService.createHorario({ ...entry, planificacionSemestreId: 8 })).rejects.toThrow(/no coincide/);
    expect(crear).not.toHaveBeenCalled();
  });
  it("actualiza entrada sin sala sin revisar conflictos de sala", async () => {
    const creada = preparar();
    const conflicto = vi.spyOn(horariosRepository, "findBySalaBloquePlanificacion");
    const actualizar = vi.spyOn(horariosRepository, "update").mockResolvedValue(creada);
    await horariosService.updateHorario(12, { tipoHoraId: 4 });
    expect(actualizar).toHaveBeenCalledWith(12, entry, 7);
    expect(conflicto).not.toHaveBeenCalled();
  });
  it("libera sala anterior sin tratarla como ocupada", async () => {
    preparar();
    const lecturas = vi.spyOn(horariosRepository, "findById").mockResolvedValue({ id: 12, ...entry, salaId: 9 } as any);
    const conflicto = vi.spyOn(horariosRepository, "findBySalaBloquePlanificacion");
    const actualizar = vi.spyOn(horariosRepository, "update").mockResolvedValue({ id: 12, ...entry });
    await horariosService.updateHorario(12, { salaId: null });
    expect(actualizar).toHaveBeenCalledWith(12, entry, 7);
    expect(conflicto).not.toHaveBeenCalled();
    expect(lecturas).toHaveBeenCalledTimes(2);
  });
});
