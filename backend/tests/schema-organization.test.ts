import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

const modules = {
  "asignaturas": "asignaturas",
  "asignatura-tipo-hora": "asignaturaTipoHora",
  "bloques-horarios": "bloquesHorarios",
  "bloques-reservados": "bloquesReservados",
  "carrera-asignatura": "carreraAsignatura",
  "carrera-departamento": "carreraDepartamento",
  "carreras": "carreras",
  "departamentos": "departamentos",
  "disponibilidad-profesores": "disponibilidadProfesores",
  "ejecuciones-optimizacion": "ejecucionesOptimizacion",
  "horarios-asignaturas": "horariosAsignaturas",
  "ofertas-asignaturas": "ofertasAsignaturas",
  "oferta-tipo-hora": "ofertaTipoHora",
  "profesores": "profesores",
  "planificaciones-semestres": "planificacionesSemestres",
  "salas": "salas",
  "secretarias": "secretarias",
  "tipos-hora": "tiposHora",
  "usuarios": "usuarios",
} as const;
const dir = new URL("../src/db/schema/", import.meta.url);

// Capturado del grafo de ejecución previo a la reorganización, las capturas SQL no cubren relaciones.
const graph = {
  asignaturaTipoHora: { asignatura: "One:asignaturas", tipoHora: "One:tipos_hora" },
  asignaturas: { departamento: "One:departamentos", carreraAsignaturas: "Many:carrera_asignatura", ofertas: "Many:ofertas_asignaturas", tiposHora: "Many:asignatura_tipo_hora" },
  bloquesHorarios: { disponibilidades: "Many:disponibilidad_profesores", horarios: "Many:horarios_asignaturas", bloquesReservados: "Many:bloques_reservados" },
  bloquesReservados: { carrera: "One:carreras", bloqueHorario: "One:bloques_horarios" },
  carreraAsignatura: { carrera: "One:carreras", asignatura: "One:asignaturas" },
  carreraDepartamento: { carrera: "One:carreras", departamento: "One:departamentos" },
  carreras: { carreraDepartamentos: "Many:carrera_departamento", carreraAsignaturas: "Many:carrera_asignatura", secretarias: "Many:secretarias", planificacionesSemestres: "Many:planificaciones_semestres", bloquesReservados: "Many:bloques_reservados" },
  departamentos: { asignaturas: "Many:asignaturas", profesores: "Many:profesores", carreraDepartamentos: "Many:carrera_departamento" },
  disponibilidadProfesores: { profesor: "One:profesores", planificacionSemestre: "One:planificaciones_semestres", bloque: "One:bloques_horarios" },
  ejecucionesOptimizacion: { planificacion: "One:planificaciones_semestres" },
  horariosAsignaturas: { oferta: "One:ofertas_asignaturas", asignacion: "One:oferta_tipo_hora", sala: "One:salas", bloque: "One:bloques_horarios", tipoHora: "One:tipos_hora", planificacionSemestre: "One:planificaciones_semestres" },
  ofertasAsignaturas: { asignatura: "One:asignaturas", asignaciones: "Many:oferta_tipo_hora", planificacionSemestre: "One:planificaciones_semestres", horarios: "Many:horarios_asignaturas" },
  ofertaTipoHora: { oferta: "One:ofertas_asignaturas", profesor: "One:profesores", tipoHora: "One:tipos_hora", horarios: "Many:horarios_asignaturas" },
  planificacionesSemestres: { carrera: "One:carreras", ofertas: "Many:ofertas_asignaturas", horarios: "Many:horarios_asignaturas", disponibilidades: "Many:disponibilidad_profesores" },
  profesores: { usuario: "One:usuarios", departamento: "One:departamentos", asignaciones: "Many:oferta_tipo_hora", disponibilidades: "Many:disponibilidad_profesores" },
  salas: { horarios: "Many:horarios_asignaturas" },
  secretarias: { usuario: "One:usuarios", carrera: "One:carreras" },
  tiposHora: { horarios: "Many:horarios_asignaturas", asignaturas: "Many:asignatura_tipo_hora", asignaciones: "Many:oferta_tipo_hora" },
  usuarios: { profesor: "One:profesores", secretaria: "One:secretarias" },
};

describe("Organización plana del esquema (sin conexión externa)", () => {
  it("usa solo los archivos previstos por entidad y el módulo de reexportación de la aplicación", () => {
    const files = readdirSync(dir).sort();
    expect(files).toEqual([...Object.keys(modules).map((name) => `${name}.schema.ts`), "index.ts"].sort());
  });

  it.each(Object.entries(modules))("agrupa una tabla, sus relaciones y sus tipos originales en %s", (name, table) => {
      const source = readFileSync(new URL(`${name}.schema.ts`, dir), "utf8");
      expect(source.match(/\bpgTable\s*\(/g)).toHaveLength(1);
      const tableOffset = source.indexOf(`export const ${table} = pgTable(`);
      const relationsOffset = source.indexOf(`export const ${table}Relations = relations(`);
      expect(tableOffset).toBeGreaterThanOrEqual(0);
      expect(relationsOffset).toBeGreaterThan(tableOffset);
      expect(source.match(/export type \w+ = typeof \w+\.\$infer(?:Select|Insert);/g)).toHaveLength(2);
      expect(source.indexOf("export type ")).toBeGreaterThan(relationsOffset);
      expect(source).not.toMatch(/from ["']\.\/index(?:\.js)?["']/);
      if (table === "usuarios") expect(source.indexOf("export const rolUsuarioEnum")).toBeLessThan(tableOffset);
  });

  it.each(Object.entries(modules))("carga %s como punto de entrada independiente sin caché previa", async (name, table) => {
    vi.resetModules();
    const entry = await import(`../src/db/schema/${name}.schema.ts`);
    expect(Object.keys(entry).sort()).toEqual([table, `${table}Relations`, ...(table === "usuarios" ? ["rolUsuarioEnum"] : []), ...(table === "profesores" ? ["columnasProfesorSinRut"] : [])].sort());
    const config = getTableConfig(entry[table]);
    expect(config.name).toBe(name.replaceAll("-", "_"));
    for (const fk of config.foreignKeys) expect(fk.reference().foreignColumns.length).toBeGreaterThan(0);
    expect(entry[`${table}Relations`].config(createTableRelationsHelpers(entry[table]))).toBeDefined();
  });

  it("conserva las exportaciones previstas en ejecución y el grafo de relaciones", async () => {
    const schema = await import("../src/db/schema/index.js");
    expect(Object.keys(schema).sort()).toEqual([
      ...Object.values(modules).flatMap((table) => [table, `${table}Relations`]), "rolUsuarioEnum", "columnasProfesorSinRut",
    ].sort());
    const config = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
    expect(Object.fromEntries(Object.entries(config.tables).map(([table, value]) => [table,
      Object.fromEntries(Object.entries(value.relations).map(([name, relation]) => [name,
        `${relation.constructor.name}:${relation.referencedTableName}`])),
    ]))).toEqual(graph);
  });

  it("exporta una proyección exacta del profesor sin exponer rut", async () => {
    const { columnasProfesorSinRut } = await import("../src/db/schema/index.js");
    expect(columnasProfesorSinRut).toEqual({
      id: true, usuarioId: true, departamentoId: true, nombre: true, tipo: true,
    });
    expect(columnasProfesorSinRut).not.toHaveProperty("rut");
  });

  it("no produce sentencias SQL de migración respecto de la última captura del esquema", async () => {
    const schema = await import("../src/db/schema/index.js");
    const journal = JSON.parse(readFileSync(new URL("../src/db/migrations/meta/_journal.json", import.meta.url), "utf8"));
    const latest = journal.entries.at(-1);
    const previous = JSON.parse(readFileSync(new URL(`../src/db/migrations/meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`, import.meta.url), "utf8"));
    const current = generateDrizzleJson(schema, previous.id);
    expect(Object.keys(current.tables)).toHaveLength(Object.keys(modules).length);
    expect(await generateMigration(previous, current)).toEqual([]);
  });
});
