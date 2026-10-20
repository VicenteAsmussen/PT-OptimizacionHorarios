import { describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import { readFileSync } from "node:fs";
import * as esquema from "../src/db/schema/index.js";
import { sembrarAcademico } from "../src/db/seeds/academico.js";
import { datosCarreras, datosDepartamentos, datosSemestres, datosTiposHora } from "../src/db/seeds/data/academico.js";
import type { BaseDatosSeed } from "../src/db/seeds/contexto.js";
import { sembrarPlanificacionHorarios } from "../src/db/seeds/horarios.js";
import { datosBloques, datosSalas, datosPlanificacionHorarios } from "../src/db/seeds/data/horarios.js";

const tabla = () => esquema.planificacionesSemestres;
const dialecto = new PgDialect();
const textoSql = (expresion: SQL) => dialecto.sqlToQuery(expresion).sql;

describe("Corte estructural T2 (offline)", () => {
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

describe("Planificaciones por carrera (offline)", () => {
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

// Catalog reads return existing seed records. Planning statements use real Drizzle SQL;
// only PostgreSQL execution is replaced by a small conflict-aware in-memory fixture.
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

describe("Seed de planificaciones (offline)", () => {
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

// SQL real con ejecución en memoria: no driver PostgreSQL ni configuración ambiental.
function crearSeedHorarios() {
  type Fila = Record<string, unknown>;
  const tablas: Record<string, Fila[]> = {
    carreras: datosCarreras.map((fila, indice) => ({ id: indice + 1, ...fila })),
    planificaciones_semestres: datosCarreras.flatMap((_, indice) => datosSemestres.map((periodo, numero) => ({ id: indice * 2 + numero + 1, carreraId: indice + 1, ...periodo, estadoPlanificacion: "preparacion" }))),
    profesores: [{ id: 7 }],
    carrera_asignatura: datosCarreras.map((_, indice) => ({ carreraId: indice + 1, asignaturaCodigo: "INF100" })),
    bloques_horarios: datosBloques.map((fila, indice) => ({ id: indice + 1, ...fila })),
    tipos_hora: datosTiposHora.map((fila, indice) => ({ id: indice + 1, ...fila })),
    salas: datosSalas.map((fila, indice) => ({ id: indice + 1, ...fila })),
    ofertas_asignaturas: [], horarios_asignaturas: [], disponibilidad_profesores: [],
  };
  const mapa = Object.fromEntries(Object.values(esquema).filter(valor => {
    try { return !!getTableName(valor as never); } catch { return false; }
  }).map(valor => [getTableName(valor as never), getTableColumns(valor as never)]));
  const sentencias: string[] = [];
  const base = drizzle(async (sql, params) => {
    sentencias.push(sql);
    const nombre = sql.match(/(?:from|into|update) "([^"]+)"/)?.[1];
    if (!nombre || !tablas[nombre]) throw new Error(`SQL inesperado del seed: ${sql}`);
    const columnas = mapa[nombre];
    const campo = (columna: string) => Object.entries(columnas).find(([, definicion]) => definicion.name === columna)?.[0] ?? columna;
    if (sql.startsWith("select")) {
      const condiciones = [...sql.matchAll(/"\w+"\."([^"]+)" = \$(\d+)/g)];
      const filas = tablas[nombre].filter(fila => condiciones.every(([, columna, parametro]) => fila[campo(columna)] === params[Number(parametro) - 1]));
      const seleccion = sql.slice(7, sql.indexOf(" from ")).split(", ").map(columna => campo(columna.replaceAll('"', '')));
      return { rows: filas.map(fila => seleccion.map(columna => fila[columna])) };
    }
    if (sql.startsWith("insert")) {
      const insercion = sql.match(/\(([^)]+)\) values \(([^)]+)\)/)!;
      const columnasInsertadas = insercion[1].split(", ").map(columna => campo(columna.replaceAll('"', '')));
      const valores = insercion[2].split(", ");
      const fila: Fila = { id: tablas[nombre].length + 1 };
      columnasInsertadas.forEach((columna, indice) => {
        const parametro = valores[indice].match(/^\$(\d+)$/);
        if (parametro) fila[columna] = params[Number(parametro[1]) - 1];
      });
      tablas[nombre].push(fila);
      return { rows: [] };
    }
    if (sql.startsWith("update")) {
      const fila = tablas[nombre].find(fila => fila.id === params[1]);
      if (!fila) throw new Error("Planificación inexistente");
      fila.estadoPlanificacion = params[0];
      return { rows: [] };
    }
    throw new Error(`Mutación no permitida en seed: ${sql}`);
  }, { schema: esquema });
  base.transaction = (async operacion => operacion(base as never)) as typeof base.transaction;
  return { baseDatos: base as unknown as BaseDatosSeed, tablas, sentencias };
}

describe("Seed de ofertas/horarios/disponibilidad por carrera (offline)", () => {
  it("mantiene Civil actual en preparacion, el historico publicado y Ejecucion en propuesta", async () => {
    const contexto = crearSeedHorarios();
    for (let repeticion = 0; repeticion < 2; repeticion++) {
      await sembrarPlanificacionHorarios(contexto.baseDatos);
      const estados = datosPlanificacionHorarios.map(fixture => {
        const carrera = contexto.tablas.carreras.find(fila => fila.nombre === fixture.carrera)!;
        return contexto.tablas.planificaciones_semestres.find(fila => fila.carreraId === carrera.id && fila.codigo === fixture.periodo)?.estadoPlanificacion;
      });
      expect(estados).toEqual(["publicado", "preparacion", "propuesta"]);
    }
  });
  it("mapea fixtures explícitos y repetir no duplica ni reabre estados", async () => {
    const contexto = crearSeedHorarios();
    await sembrarPlanificacionHorarios(contexto.baseDatos);
    expect(contexto.tablas.ofertas_asignaturas).toHaveLength(datosPlanificacionHorarios.length);
    expect(contexto.tablas.horarios_asignaturas).toHaveLength(datosPlanificacionHorarios.length);
    expect(contexto.tablas.disponibilidad_profesores).toHaveLength(datosPlanificacionHorarios.length);
    for (const fixture of datosPlanificacionHorarios) {
      const carrera = contexto.tablas.carreras.find(fila => fila.nombre === fixture.carrera)!;
      const planificacion = contexto.tablas.planificaciones_semestres.find(fila => fila.carreraId === carrera.id && fila.codigo === fixture.periodo)!;
      expect(planificacion.estadoPlanificacion).toBe(fixture.estadoPlanificacion);
      const oferta = contexto.tablas.ofertas_asignaturas.find(fila => fila.planificacionSemestreId === planificacion.id)!;
      expect(oferta.asignaturaCodigo).toBe(fixture.asignaturaCodigo);
      expect(contexto.tablas.horarios_asignaturas.find(fila => fila.ofertaId === oferta.id)?.planificacionSemestreId).toBe(planificacion.id);
      expect(contexto.tablas.disponibilidad_profesores.find(fila => fila.planificacionSemestreId === planificacion.id)?.profesorId).toBe(oferta.profesorId);
    }
    expect(contexto.tablas.planificaciones_semestres.find(fila => fila.carreraId === 2 && fila.codigo === "2026-1")?.estadoPlanificacion).toBe("preparacion");
    const antes = structuredClone(contexto.tablas);
    const cantidad = contexto.sentencias.length;
    await sembrarPlanificacionHorarios(contexto.baseDatos);
    expect(contexto.tablas).toEqual(antes);
    expect(contexto.sentencias.slice(cantidad).some(sql => /^(insert|update|delete)/.test(sql))).toBe(false);
  });
  it.each(["propuesta", "publicado"])("no modifica una planificación %s preexistente", async estado => {
    const contexto = crearSeedHorarios();
    contexto.tablas.planificaciones_semestres.forEach(fila => { fila.estadoPlanificacion = estado; });
    const antes = structuredClone(contexto.tablas);
    await sembrarPlanificacionHorarios(contexto.baseDatos);
    await sembrarPlanificacionHorarios(contexto.baseDatos);
    expect(contexto.tablas).toEqual(antes);
    expect(contexto.sentencias.some(sql => /^(insert|update|delete)/.test(sql))).toBe(false);
  });
});
