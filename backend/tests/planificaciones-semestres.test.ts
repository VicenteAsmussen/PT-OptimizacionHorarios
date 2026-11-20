import { describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import { readFileSync } from "node:fs";
import * as esquema from "../src/db/schema/index.js";
import { sembrarAcademico } from "../src/db/seeds/academico.js";
import { datosCarreras, datosDepartamentos, datosSemestres, datosTiposHora } from "../src/db/seeds/data/academico.js";
import type { BaseDatosSeed } from "../src/db/seeds/contexto.js";

const tabla = () => esquema.planificacionesSemestres;
const dialecto = new PgDialect();
const textoSql = (expresion: SQL) => dialecto.sqlToQuery(expresion).sql;

describe("Corte estructural T2 (sin conexión externa)", () => {
  it("reemplaza las FK globales por contexto de planificacion", () => {
    for (const tabla of [esquema.ofertasAsignaturas, esquema.horariosAsignaturas, esquema.disponibilidadProfesores]) {
      const columnas = getTableColumns(tabla);
      expect(columnas).toHaveProperty("planificacionSemestreId");
      expect(columnas).not.toHaveProperty("semestreId");
      expect(getTableConfig(tabla).foreignKeys.some(fk => fk.reference().foreignTable === esquema.planificacionesSemestres)).toBe(true);
    }
  });
  it("exige que entrada y oferta pertenezcan a la misma planificacion", () => {
    const claves = getTableConfig(esquema.horariosAsignaturas).foreignKeys.map(fk => fk.reference());
    expect(claves.some(fk => fk.foreignTable === esquema.ofertasAsignaturas && fk.columns.map(c => c.name).join(',') === 'oferta_id,planificacion_semestre_id' && fk.foreignColumns.map(c => c.name).join(',') === 'id,planificacion_semestre_id')).toBe(true);
  });
});

describe("Planificaciones por carrera (sin conexión externa)", () => {
  it("define campos obligatorios, valores iniciales y solo una FK a carrera", () => {
    const config = getTableConfig(tabla());
    expect(config.name).toBe("planificaciones_semestres");
    expect(config.columns.map((columna) => columna.name)).toEqual([
      "id", "carrera_id", "codigo", "actual", "estado_planificacion",
    ]);
    expect(config.columns.every((columna) => columna.notNull)).toBe(true);
    expect(tabla().id.primary).toBe(true);
    expect(tabla().actual.default).toBe(false);
    expect(tabla().estadoPlanificacion.default).toBe("preparacion");
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0].reference().foreignTable).toBe(esquema.carreras);
    expect(config.foreignKeys[0].reference().columns).toEqual([tabla().carreraId]);
  });

  it("permite compartir codigo entre carreras y limita el actual por carrera", () => {
    const config = getTableConfig(tabla());
    expect(config.uniqueConstraints.map((restriccion) => restriccion.columns.map((columna) => columna.name)))
      .toEqual([["carrera_id", "codigo"]]);
    expect(tabla().codigo.isUnique).toBe(false);
    const [indice] = config.indexes;
    expect(config.indexes).toHaveLength(1);
    expect(indice.config.unique).toBe(true);
    expect(indice.config.columns.map((columna) => "name" in columna && columna.name)).toEqual(["carrera_id"]);
    expect(textoSql(indice.config.where!)).toMatch(/"actual"\s*=\s*true/);
  });

  it("restringe codigo en PostgreSQL sin reducir varchar ni truncar datos existentes", () => {
    const restriccion = getTableConfig(tabla()).checks.find(check => check.name === "planificaciones_semestres_codigo_check");
    expect(restriccion).toBeDefined();
    expect(textoSql(restriccion!.value)).toContain('char_length("planificaciones_semestres"."codigo") = 6');
    expect(textoSql(restriccion!.value)).toContain("~ '^[0-9]{4}-[12]$'");
    expect(tabla().codigo.length).toBe(20);
  });

  it("restringe los estados a preparacion, propuesta y publicado", () => {
    const restriccion = getTableConfig(tabla()).checks.find(check => check.name === "planificaciones_semestres_estado_check")!;
    expect(textoSql(restriccion.value)).toMatch(/in\s*\('preparacion', 'propuesta', 'publicado'\)/i);
  });

  it("0014 elimina solo anio y añade el CHECK sin corregir ni reiniciar datos", () => {
    const directorio = new URL("../src/db/migrations/", import.meta.url);
    const diario = JSON.parse(readFileSync(new URL("meta/_journal.json", directorio), "utf8"));
    const entrada = diario.entries.find((entrada: { idx: number }) => entrada.idx === 14);
    expect(entrada).toBeDefined();
    const migracion = readFileSync(new URL(`${entrada.tag}.sql`, directorio), "utf8");
    const sentencias = migracion.replace(/--[^\n]*/g, "").split(";").map(texto => texto.trim()).filter(Boolean);
    expect(sentencias).toEqual([
      'ALTER TABLE "planificaciones_semestres" DROP COLUMN "anio"',
      `ALTER TABLE "planificaciones_semestres" ADD CONSTRAINT "planificaciones_semestres_codigo_check" CHECK (char_length("planificaciones_semestres"."codigo") = 6 and "planificaciones_semestres"."codigo" ~ '^[0-9]{4}-[12]$')`,
    ]);
    const anterior = JSON.parse(readFileSync(new URL("meta/0013_snapshot.json", directorio), "utf8"));
    const actual = JSON.parse(readFileSync(new URL("meta/0014_snapshot.json", directorio), "utf8"));
    expect(actual.prevId).toBe(anterior.id);
    const esperado = structuredClone(anterior.tables);
    delete esperado["public.planificaciones_semestres"].columns.anio;
    esperado["public.planificaciones_semestres"].checkConstraints.planificaciones_semestres_codigo_check = {
      name: "planificaciones_semestres_codigo_check",
      value: 'char_length("planificaciones_semestres"."codigo") = 6 and "planificaciones_semestres"."codigo" ~ \'^[0-9]{4}-[12]$\'',
    };
    expect(actual.tables).toEqual(esperado);
    for (const clave of ["enums", "schemas", "sequences", "roles", "policies", "views"]) expect(actual[clave]).toEqual(anterior[clave]);
  });

  it("genera una migracion exclusivamente aditiva y conserva las tablas previas", () => {
    const directorio = new URL("../src/db/migrations/", import.meta.url);
    const diario = JSON.parse(readFileSync(new URL("meta/_journal.json", directorio), "utf8"));
    const entrada = diario.entries.find((entrada: { idx: number }) => entrada.idx === 12);
    expect(entrada.idx).toBe(12);
    const migracion = readFileSync(new URL(`${entrada.tag}.sql`, directorio), "utf8");
    expect(migracion).toContain('CREATE TABLE "planificaciones_semestres"');
    expect(migracion).not.toMatch(/(?:^|;)\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/i);
    expect(migracion).not.toMatch(/ALTER TABLE "(?!planificaciones_semestres")/);
    const anterior = JSON.parse(readFileSync(new URL("meta/0011_snapshot.json", directorio), "utf8"));
    const actual = JSON.parse(readFileSync(new URL("meta/0012_snapshot.json", directorio), "utf8"));
    expect(actual.prevId).toBe(anterior.id);
    for (const [nombre, definicion] of Object.entries(anterior.tables)) expect(actual.tables[nombre]).toEqual(definicion);
    expect(Object.keys(actual.tables)).toHaveLength(Object.keys(anterior.tables).length + 1);
  });
});

// Los catálogos devuelven registros existentes de la carga inicial y las planificaciones usan SQL real de Drizzle.
// Solo se sustituye la ejecución en PostgreSQL por datos en memoria que detectan conflictos.
function crearBaseDatos(planificaciones: unknown[][] = [], fallo?: Error) {
  const sentencias: { sql: string; params: unknown[] }[] = [];
  const catalogos = [
    [esquema.tiposHora, datosTiposHora], [esquema.departamentos, datosDepartamentos],
    [esquema.carreras, datosCarreras],
  ] as const;
  const baseDatos = drizzle(async (sql, params) => {
    sentencias.push({ sql, params });
    if (sql.startsWith('select') && sql.includes('from "planificaciones_semestres"')) {
      return { rows: planificaciones.filter((fila) => fila[1] === params[0] && fila[3] === true) };
    }
    for (const [tablaCatalogo, datos] of catalogos) {
      if (sql.startsWith('select') && sql.includes(`from "${getTableName(tablaCatalogo)}"`)) {
        const indice = datos.findIndex((dato) => Object.values(dato).includes(params[0] as never));
        const dato = datos[indice];
        return { rows: dato ? [Object.keys(getTableColumns(tablaCatalogo)).map((campo) => campo === 'id' ? indice + 1 : (dato as Record<string, unknown>)[campo])] : [] };
      }
    }
    if (sql.startsWith('insert into "planificaciones_semestres"')) {
      if (fallo) throw fallo;
      expect(sql).toContain('on conflict ("carrera_id","codigo") do nothing');
      for (let indice = 0; indice < params.length; indice += 3) {
        const [carreraId, codigo, actual] = params.slice(indice, indice + 3);
        expect(codigo).toMatch(/^[0-9]{4}-[12]$/);
        expect(codigo).toHaveLength(6);
        if (planificaciones.some((fila) => fila[1] === carreraId && fila[2] === codigo)) continue;
        if (actual && planificaciones.some((fila) => fila[1] === carreraId && fila[3])) throw new Error('actual duplicado');
        planificaciones.push([planificaciones.length + 1, carreraId, codigo, actual, 'preparacion']);
      }
    }
    return { rows: [] };
  }, { schema: esquema });
  return { baseDatos: baseDatos as unknown as BaseDatosSeed, sentencias, planificaciones };
}

describe("Carga inicial de planificaciones (sin conexión externa)", () => {
  it("reconcilia campos y horas de asignaturas definidos por los datos de prueba sin borrar datos dependientes", async () => {
    const contexto = crearBaseDatos();
    const registro = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await sembrarAcademico(contexto.baseDatos);
      const asignaturas = contexto.sentencias.filter(({ sql }) => sql.startsWith('insert into "asignaturas"'));
      expect(asignaturas).toHaveLength(49);
      for (const { sql } of asignaturas) {
        const actualizacion = sql.split(" do update set ")[1];
        expect(sql).toContain('on conflict ("codigo") do update set');
        expect(actualizacion).toContain('"nombre"');
        expect(actualizacion).toContain('"departamento_id"');
        expect(actualizacion).toContain('"semestre_malla"');
        expect(actualizacion).not.toContain('"es_critica"');
      }
      const horas = contexto.sentencias.filter(({ sql }) => sql.startsWith('insert into "asignatura_tipo_hora"'));
      expect(horas.length).toBeGreaterThan(0);
      expect(horas.every(({ sql }) => sql.includes('on conflict ("asignatura_codigo","tipo_hora_id") do update set "horas"'))).toBe(true);
      expect(horas.some(({ params }) => params[0] === "340277" && params[1] === 1 && params[2] === 2)).toBe(true);
      expect(horas.some(({ params }) => params[0] === "620434" && params[1] === 2 && params[2] === 2)).toBe(true);
      expect(horas.some(({ params }) => ["620449", "620456", "620477"].includes(String(params[0])))).toBe(false);
      expect(contexto.sentencias.some(({ sql }) => /^(delete|truncate)/i.test(sql))).toBe(false);
      expect(contexto.sentencias.some(({ sql }) => /(?:into|update) "(?:ofertas_asignaturas|oferta_tipo_hora|horarios_asignaturas|disponibilidad_profesores)"/.test(sql))).toBe(false);
    } finally { registro.mockRestore(); }
  });

  it("asegura todos los periodos por carrera y repetirlo no cambia filas", async () => {
    const contexto = crearBaseDatos();
    const registro = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const resultado = await sembrarAcademico(contexto.baseDatos);
      expect(resultado.carreras).toHaveLength(datosCarreras.length);
      expect(contexto.planificaciones).toHaveLength(datosCarreras.length * datosSemestres.length);
      expect(contexto.planificaciones.filter((fila) => fila[3]).map((fila) => fila[2]))
        .toEqual(datosCarreras.map(() => '2026-2'));
      const anteriores = structuredClone(contexto.planificaciones);
      await sembrarAcademico(contexto.baseDatos);
      expect(contexto.planificaciones).toEqual(anteriores);
    } finally { registro.mockRestore(); }
  });

  it.each(['propuesta', 'publicado'])("preserva estado %s e historial inactivo sin reemplazar otro actual", async (estado) => {
    const existentes = [[51, 1, '2026-1', false, estado], [52, 1, '2026-2', false, estado], [53, 2, '2027-1', true, estado]];
    const contexto = crearBaseDatos(structuredClone(existentes));
    const registro = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await sembrarAcademico(contexto.baseDatos);
      expect(contexto.planificaciones.slice(0, 3)).toEqual(existentes);
      expect(contexto.planificaciones.find((fila) => fila[1] === 2 && fila[2] === '2026-2')?.[3]).toBe(false);
      expect(contexto.sentencias.some(({ sql }) => sql.startsWith('update "planificaciones_semestres"'))).toBe(false);
    } finally { registro.mockRestore(); }
  });

  it("conserva una planificacion publicada actual y agrega solo el periodo faltante", async () => {
    const existente = [51, 1, '2026-2', true, 'publicado'];
    const contexto = crearBaseDatos([structuredClone(existente)]);
    const registro = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await sembrarAcademico(contexto.baseDatos);
      expect(contexto.planificaciones[0]).toEqual(existente);
      expect(contexto.planificaciones.filter((fila) => fila[1] === 1)).toHaveLength(2);
      expect(contexto.planificaciones.find((fila) => fila[1] === 1 && fila[2] === '2026-1'))
        .toEqual([2, 1, '2026-1', false, 'preparacion']);
    } finally { registro.mockRestore(); }
  });

  it("propaga errores de insercion en lugar de ocultarlos", async () => {
    const contexto = crearBaseDatos([], new Error('fallo planificacion'));
    const registro = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(sembrarAcademico(contexto.baseDatos)).rejects.toThrow();
    } finally { registro.mockRestore(); }
    expect(contexto.sentencias.some(({ sql }) => sql.startsWith('insert into "planificaciones_semestres"'))).toBe(true);
  });
});
