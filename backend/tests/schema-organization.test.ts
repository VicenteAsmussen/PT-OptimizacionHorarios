import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

const modules = {
  "asignaturas": "asignaturas",
  "asignatura-tipo-hora": "asignaturaTipoHora",
  "bloques-horarios": "bloquesHorarios",
  "carrera-asignatura": "carreraAsignatura",
  "carrera-departamento": "carreraDepartamento",
  "carreras": "carreras",
  "departamentos": "departamentos",
  "disponibilidad-profesores": "disponibilidadProfesores",
  "horarios-asignaturas": "horariosAsignaturas",
  "ofertas-asignaturas": "ofertasAsignaturas",
  "profesores": "profesores",
  "salas": "salas",
  "secretarias": "secretarias",
  "semestres": "semestres",
  "semestres-horarios": "semestresHorarios",
  "tipos-hora": "tiposHora",
  "usuarios": "usuarios",
} as const;
const dir = new URL("../src/db/schema/", import.meta.url);

// Captured from the pre-refactor runtime graph; SQL snapshot checks do not cover relations.
const graph = {
  asignaturaTipoHora: { asignatura: "One:asignaturas", tipoHora: "One:tipos_hora" },
  asignaturas: { carreraAsignaturas: "Many:carrera_asignatura", ofertas: "Many:ofertas_asignaturas", tiposHora: "Many:asignatura_tipo_hora" },
  bloquesHorarios: { disponibilidades: "Many:disponibilidad_profesores", horarios: "Many:horarios_asignaturas" },
  carreraAsignatura: { carrera: "One:carreras", asignatura: "One:asignaturas" },
  carreraDepartamento: { carrera: "One:carreras", departamento: "One:departamentos" },
  carreras: { carreraDepartamentos: "Many:carrera_departamento", carreraAsignaturas: "Many:carrera_asignatura", secretarias: "Many:secretarias" },
  departamentos: { profesores: "Many:profesores", carreraDepartamentos: "Many:carrera_departamento" },
  disponibilidadProfesores: { profesor: "One:profesores", semestre: "One:semestres", bloque: "One:bloques_horarios" },
  horariosAsignaturas: { publicacion: "One:semestres_horarios", oferta: "One:ofertas_asignaturas", sala: "One:salas", bloque: "One:bloques_horarios", tipoHora: "One:tipos_hora", semestre: "One:semestres" },
  ofertasAsignaturas: { asignatura: "One:asignaturas", profesor: "One:profesores", semestre: "One:semestres", horarios: "Many:horarios_asignaturas" },
  profesores: { usuario: "One:usuarios", departamento: "One:departamentos", ofertas: "Many:ofertas_asignaturas", disponibilidades: "Many:disponibilidad_profesores" },
  salas: { horarios: "Many:horarios_asignaturas" },
  secretarias: { usuario: "One:usuarios", carrera: "One:carreras" },
  semestres: { publicaciones: "Many:semestres_horarios", ofertas: "Many:ofertas_asignaturas", disponibilidades: "Many:disponibilidad_profesores", horarios: "Many:horarios_asignaturas" },
  semestresHorarios: { semestre: "One:semestres", entrada: "One:horarios_asignaturas" },
  tiposHora: { horarios: "Many:horarios_asignaturas", asignaturas: "Many:asignatura_tipo_hora" },
  usuarios: { profesor: "One:profesores", secretaria: "One:secretarias" },
};

describe("Flat schema organization (offline)", () => {
  it("uses only the intended entity-named files and application barrel", () => {
    const files = readdirSync(dir).sort();
    expect(files).toEqual([...Object.keys(modules).map((name) => `${name}.schema.ts`), "index.ts"].sort());
  });

  it.each(Object.entries(modules))("colocates one table, relations and original types in %s", (name, table) => {
      const source = readFileSync(new URL(`${name}.schema.ts`, dir), "utf8");
      expect(source.match(/\bpgTable\s*\(/g)).toHaveLength(1);
      const tableOffset = source.indexOf(`export const ${table} = pgTable(`);
      const relationsOffset = source.indexOf(`export const ${table}Relations = relations(`);
      expect(tableOffset).toBeGreaterThanOrEqual(0);
      expect(relationsOffset).toBeGreaterThan(tableOffset);
      // semestresHorarios originally has no inferred types; do not add public names.
      if (table !== "semestresHorarios") {
        expect(source.match(/export type \w+ = typeof \w+\.\$infer(?:Select|Insert);/g)).toHaveLength(2);
        expect(source.indexOf("export type ")).toBeGreaterThan(relationsOffset);
      }
      expect(source).not.toMatch(/from ["']\.\/index(?:\.js)?["']/);
      if (table === "usuarios") expect(source.indexOf("export const rolUsuarioEnum")).toBeLessThan(tableOffset);
  });

  it.each(Object.entries(modules))("loads %s as a fresh standalone entry point", async (name, table) => {
    vi.resetModules();
    const entry = await import(`../src/db/schema/${name}.schema.ts`);
    expect(Object.keys(entry).sort()).toEqual([table, `${table}Relations`, ...(table === "usuarios" ? ["rolUsuarioEnum"] : [])].sort());
    const config = getTableConfig(entry[table]);
    expect(config.name).toBe(name.replaceAll("-", "_"));
    for (const fk of config.foreignKeys) expect(fk.reference().foreignColumns.length).toBeGreaterThan(0);
    expect(entry[`${table}Relations`].config(createTableRelationsHelpers(entry[table]))).toBeDefined();
  });

  it("preserves all 35 runtime exports and the relation graph", async () => {
    const schema = await import("../src/db/schema/index.js");
    expect(Object.keys(schema).sort()).toEqual([
      ...Object.values(modules).flatMap((table) => [table, `${table}Relations`]), "rolUsuarioEnum",
    ].sort());
    const config = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
    expect(Object.fromEntries(Object.entries(config.tables).map(([table, value]) => [table,
      Object.fromEntries(Object.entries(value.relations).map(([name, relation]) => [name,
        `${relation.constructor.name}:${relation.referencedTableName}`])),
    ]))).toEqual(graph);
  });

  it("produces zero SQL migration statements against the existing 0006 snapshot", async () => {
    const schema = await import("../src/db/schema/index.js");
    const previous = JSON.parse(readFileSync(new URL("../src/db/migrations/meta/0006_snapshot.json", import.meta.url), "utf8"));
    const current = generateDrizzleJson(schema, previous.id);
    expect(Object.keys(current.tables)).toHaveLength(17);
    expect(await generateMigration(previous, current)).toEqual([]);
  });
});
