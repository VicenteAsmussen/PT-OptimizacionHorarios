import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
import * as schema from "../src/db/schema/index.js";
import { createHorarioValidation, updateHorarioValidation } from "../src/validations/horarios.validation.js";
import { createSemestreValidation, updateSemestreValidation } from "../src/validations/semestres.validation.js";

const { statements, responses, transaction } = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  responses: [] as (unknown[][] | Error)[],
  transaction: vi.fn(),
}));
// Real SQL construction, scripted results: no configured driver or PostgreSQL execution.
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("../src/db/schema/index.js");
  const db = drizzle(async (sql, params) => {
    statements.push({ sql, params });
    const response = responses.shift() ?? [];
    if (response instanceof Error) throw response;
    return { rows: response };
  }, { schema });
  db.transaction = transaction.mockImplementation(async (fn) => fn(db));
  return { db };
});
import { semestresRepository } from "../src/repositories/semestres.repository.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { horariosService } from "../src/services/horarios.service.js";

const entry = { ofertaId: 2, salaId: null, bloqueId: 3, tipoHoraId: 4, semestreId: 7 };
const entryRow = [12, 2, null, 3, 4, 7];

describe("Direct entry publication contract (offline)", () => {
  beforeEach(() => {
    statements.length = 0;
    responses.length = 0;
    transaction.mockClear();
  });

  it("has no aggregate and enforces unique entry ownership with cascading updates/deletes", () => {
    expect(schema).not.toHaveProperty("horarios");
    const entries = getTableConfig(schema.horariosAsignaturas);
    expect(entries.columns.map((c) => c.name)).not.toContain("horario_id");
    expect(entries.columns.find((c) => c.name === "sala_id")?.notNull).toBe(false);
    expect(entries.columns.find((c) => c.name === "semestre_id")?.notNull).toBe(true);
    expect(entries.uniqueConstraints.some((u) => u.columns.map((c) => c.name).join(",") === "id,semestre_id")).toBe(true);
    const relation = getTableConfig(schema.semestresHorarios);
    expect(relation.columns.find((c) => c.name === "horario_asignatura_id")?.primary).toBe(true);
    expect(relation.columns.find((c) => c.name === "horario_publicado")?.default).toBe(false);
    expect(relation.foreignKeys.some((fk) => {
      const ref = fk.reference();
      return ref.foreignTable === schema.horariosAsignaturas
        && ref.foreignColumns.map((c) => c.name).join(",") === "id,semestre_id"
        && fk.onDelete === "cascade" && fk.onUpdate === "cascade";
    })).toBe(true);
    expect(getTableConfig(schema.semestres).columns.map((c) => c.name)).not.toContain("horario_publicado");
  });

  it("moves the API boolean from semesters to entries without readiness rules", () => {
    expect(createHorarioValidation.parse(entry)).toHaveProperty("horarioPublicado", false);
    expect(createHorarioValidation.parse({ ...entry, horarioPublicado: true }).horarioPublicado).toBe(true);
    expect(updateHorarioValidation.parse({ horarioPublicado: false })).toEqual({ horarioPublicado: false });
    expect(updateHorarioValidation.parse({})).toEqual({});
    expect(updateHorarioValidation.safeParse({ horarioPublicado: "true" }).success).toBe(false);
    expect(createSemestreValidation.parse({ codigo: "2027-1", anio: 2027, horarioPublicado: true })).not.toHaveProperty("horarioPublicado");
    expect(updateSemestreValidation.parse({ horarioPublicado: true })).not.toHaveProperty("horarioPublicado");
  });

  it.each([undefined, false, true])("creates entry and publication=%s transactionally, preserving null sala", async (published) => {
    responses.push([entryRow], []);
    const result = await horariosRepository.create({ ...entry, ...(published !== undefined ? { horarioPublicado: published } : {}) });
    expect(result).toEqual({ id: 12, ...entry, horarioPublicado: published ?? false });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(statements[0].sql).toContain('insert into "horarios_asignaturas"');
    expect(statements[0].sql).not.toContain("horario_publicado");
    expect(statements[0].params).toEqual([2, null, 3, 4, 7]);
    expect(statements[1].sql).toContain('insert into "semestres_horarios"');
    expect(statements[1].params).toContain(published ?? false);
    expect(statements[1].params).toContain(12);
  });

  it("propagates relation failures instead of reporting successful creation", async () => {
    responses.push([entryRow], new Error("relation failure"));
    await expect(horariosRepository.create(entry)).rejects.toThrow();
    expect(statements[1].sql).toContain('insert into "semestres_horarios"');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("updates publication=%s together with semester reassignment", async (published) => {
    responses.push([[12, 2, null, 3, 4, 8]], [[8, 12, published]]);
    const result = await horariosRepository.update(12, { semestreId: 8, salaId: null, horarioPublicado: published });
    expect(result).toEqual({ id: 12, ...entry, semestreId: 8, horarioPublicado: published });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(statements[0].sql).toContain('update "horarios_asignaturas"');
    expect(statements[0].sql).not.toContain("horario_publicado");
    expect(statements[1].sql).toContain('update "semestres_horarios"');
    expect(statements[1].params).toEqual([published, 12]);
  });

  it("supports publication-only updates and preserves publication when omitted", async () => {
    responses.push([entryRow], [[7, 12, true]]);
    expect((await horariosRepository.update(12, { horarioPublicado: true }))?.horarioPublicado).toBe(true);
    expect(statements[0].sql).toContain("for update");
    expect(statements.some(({ sql }) => sql.includes('update "horarios_asignaturas"'))).toBe(false);
    statements.length = 0;
    responses.push([entryRow], [[7, 12, true]]);
    expect((await horariosRepository.update(12, { salaId: null }))?.horarioPublicado).toBe(true);
    expect(statements[1].sql).toContain('from "semestres_horarios"');
  });

  it("does not write publication for a missing entry", async () => {
    responses.push([]);
    expect(await horariosRepository.update(404, { horarioPublicado: true })).toBeUndefined();
    expect(statements).toHaveLength(1);
  });

  it("reads publication at entry level, never on nested semesters", async () => {
    await horariosRepository.findAll({ semestreId: 7 });
    await horariosRepository.findById(12);
    for (const { sql } of statements) {
      expect(sql).toContain("sh.horario_asignatura_id");
      expect(sql).toContain("sh.horario_publicado");
      expect(sql).not.toContain("sh.semestre_id =");
    }
  });

  it("creates empty semesters without phantom entries or publication", async () => {
    responses.push([[7, "2027-1", 2027, false]]);
    expect(await semestresRepository.create({ codigo: "2027-1", anio: 2027 })).toEqual({ id: 7, codigo: "2027-1", anio: 2027, actual: false });
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('insert into "semestres"');
  });

  it("uses ordinary entry deletion and database cascades for relation cleanup", async () => {
    responses.push([entryRow]);
    expect(await horariosRepository.delete(12)).toBe(true);
    expect(statements[0].sql).toContain('delete from "horarios_asignaturas"');
  });

  it("guards unrepresentable true semesters before destructive SQL and backfills every entry", () => {
    const dir = new URL("../src/db/migrations/", import.meta.url);
    const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8"));
    expect(journal.entries.at(-1).idx).toBe(6);
    const sql = readFileSync(new URL(`${journal.entries.at(-1).tag}.sql`, dir), "utf8");
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

  it("keeps seed semesters ordinary and creates no aggregate", () => {
    const source = readFileSync(new URL("../src/db/seed.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/canonical|canónico|schema\.horarios\b/);
    // This catalog-only seed has no direct entry inserts requiring publication relations.
    expect(source).not.toMatch(/\.insert\(schema\.horariosAsignaturas\)/);
    expect(source).toContain('{ codigo: "2026-1", anio: 2026, actual: true }');
  });
});

describe("Nullable room behavior", () => {
  it("forwards publication on creation without requiring a room", async () => {
    const created = { id: 12, ...entry, horarioPublicado: true };
    vi.spyOn(horariosRepository, "findOfertaWithDetails").mockResolvedValue({ semestreId: 7, profesorId: 5 } as any);
    vi.spyOn(horariosRepository, "checkSemestreExists").mockResolvedValue(true);
    vi.spyOn(horariosRepository, "checkBloqueExists").mockResolvedValue(true);
    vi.spyOn(horariosRepository, "checkTipoHoraExists").mockResolvedValue(true);
    const salaCheck = vi.spyOn(horariosRepository, "checkSalaExists");
    vi.spyOn(horariosRepository, "findByOfertaBloque").mockResolvedValue(undefined);
    vi.spyOn(horariosRepository, "findByProfesorBloqueSemestre").mockResolvedValue(undefined);
    const create = vi.spyOn(horariosRepository, "create").mockResolvedValue(created);
    vi.spyOn(horariosRepository, "findById").mockResolvedValue(created as any);
    try {
      expect(await horariosService.createHorario({ ...entry, horarioPublicado: true })).toEqual(created);
      expect(create).toHaveBeenCalledWith({ ...entry, horarioPublicado: true });
      expect(salaCheck).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("forwards publication updates on entries without rooms", async () => {
    const existing = { id: 12, ...entry, horarioPublicado: false };
    vi.spyOn(horariosRepository, "findById").mockResolvedValue(existing as any);
    vi.spyOn(horariosRepository, "findOfertaWithDetails").mockResolvedValue({ semestreId: 7, profesorId: 5 } as any);
    const conflict = vi.spyOn(horariosRepository, "findBySalaBloqueSemestre");
    vi.spyOn(horariosRepository, "findByOfertaBloque").mockResolvedValue(undefined);
    vi.spyOn(horariosRepository, "findByProfesorBloqueSemestre").mockResolvedValue(undefined);
    const update = vi.spyOn(horariosRepository, "update").mockResolvedValue({ ...existing, horarioPublicado: true });
    try {
      await horariosService.updateHorario(12, { horarioPublicado: true });
      expect(update).toHaveBeenCalledWith(12, { horarioPublicado: true, semestreId: 7 });
      expect(conflict).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("clears a room without checking conflicts for the previous room", async () => {
    const existing = { id: 12, ...entry, salaId: 9, horarioPublicado: false };
    const reads = vi.spyOn(horariosRepository, "findById").mockResolvedValue(existing as any);
    vi.spyOn(horariosRepository, "findOfertaWithDetails").mockResolvedValue({ semestreId: 7, profesorId: 5 } as any);
    const conflict = vi.spyOn(horariosRepository, "findBySalaBloqueSemestre").mockResolvedValue({ id: 99 } as any);
    vi.spyOn(horariosRepository, "findByOfertaBloque").mockResolvedValue(undefined);
    vi.spyOn(horariosRepository, "findByProfesorBloqueSemestre").mockResolvedValue(undefined);
    const update = vi.spyOn(horariosRepository, "update").mockResolvedValue({ ...existing, salaId: null });
    try {
      await horariosService.updateHorario(12, { salaId: null });
      expect(conflict).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(12, { salaId: null, semestreId: 7 });
      expect(reads).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
