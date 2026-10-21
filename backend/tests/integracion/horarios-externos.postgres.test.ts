import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import ExcelJS from "exceljs";
import { exigirBasePruebas } from "../soporte/base-pruebas.js";

const habilitado = process.env.BASE_PRUEBAS_REINICIABLE !== undefined
  || process.env.npm_lifecycle_event === "test:excel-externos:integracion";
// Validate raw environment before importing application configuration or opening connections.
if (habilitado) exigirBasePruebas(process.env);

describe.skipIf(!habilitado)("External Excel import on isolated PostgreSQL", () => {
  let cliente: ReturnType<typeof postgres>;
  let cerrarAplicacion: () => Promise<void>;
  let servicio: typeof import("../../src/services/horarios.service.js").horariosService;
  let encabezados: readonly string[];
  const usuario = { id: 1, rol: "secretaria" };

  beforeAll(async () => {
    cliente = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const [destino] = await cliente`select current_database() as base, current_user as usuario, pg_try_advisory_lock(18874001, 1) as bloqueo`;
    if (destino.base !== "horarios_test" || destino.usuario !== "pruebas_horarios" || !destino.bloqueo) {
      throw new Error("The test database is unavailable, has an unexpected identity, or is already in use.");
    }
    await migrate(drizzle(cliente), { migrationsFolder: fileURLToPath(new URL("../../src/db/migrations", import.meta.url)) });
    const { queryClient } = await import("../../src/config/db.js");
    cerrarAplicacion = async () => { await queryClient.end(); };
    ({ horariosService: servicio } = await import("../../src/services/horarios.service.js"));
    ({ encabezadosExcelExternos: encabezados } = await import("../../src/utils/excel-horarios-externos.js"));
  }, 30000);

  afterAll(async () => {
    try { await cerrarAplicacion?.(); }
    finally { await cliente?.end(); }
  });

  beforeEach(async () => {
    // Only the explicitly authorized test database is reset, never horarios_db.
    await cliente`truncate carreras, departamentos, usuarios, bloques_horarios, tipos_hora restart identity cascade`;
    await cliente.begin(async sql => {
      await sql`insert into carreras (id, nombre) values (1, 'Career A'), (2, 'Career B')`;
      await sql`insert into departamentos (id, nombre) values (1, 'External department'), (2, 'Other department')`;
      await sql`insert into carrera_departamento (carrera_id, departamento_id, es_gestionado) values (1,1,false), (1,2,false), (2,1,false)`;
      await sql`insert into asignaturas (codigo, nombre, departamento_id, semestre_malla) values
        ('EXT100','Linear Algebra',1,2), ('EXT200','Calculus',1,4), ('EXT300','Statistics',1,3),
        ('EXT900','Other Career',1,2), ('INT100','Other Department',2,2)`;
      await sql`insert into carrera_asignatura (carrera_id, asignatura_codigo) values
        (1,'EXT100'), (1,'EXT200'), (1,'EXT300'), (1,'INT100'), (2,'EXT100'), (2,'EXT900')`;
      await sql`insert into usuarios (id, nombre, correo, clave, rol) values (1,'Secretary','secretary@example.test','not-a-login-password','secretaria')`;
      await sql`insert into secretarias (usuario_id, carrera_id) values (1,1)`;
      await sql`insert into profesores (id, departamento_id, rut, nombre, tipo) values
        (1,1,'12345678-5','Original teacher','planta'), (2,1,'11111111-1','Replacement teacher','planta'),
        (3,2,'22222222-2','Other department teacher','planta'), (4,1,'33333333-3','Other career teacher','planta')`;
      await sql`insert into planificaciones_semestres (id, carrera_id, codigo, actual, estado_planificacion) values
        (1,1,'2099-2',true,'preparacion'), (2,1,'2099-1',false,'preparacion'), (3,2,'2099-2',true,'preparacion')`;
      await sql`insert into tipos_hora (id, tipo) values (1,'Teórica')`;
      await sql`insert into bloques_horarios (id, dia, numero_bloque, hora_inicio, hora_termino) values
        (1,'Lunes',1,'08:10','08:50'), (2,'Martes',1,'08:10','08:50'), (3,'Miércoles',1,'08:10','08:50')`;
      await sql`insert into ofertas_asignaturas (id, asignatura_codigo, profesor_id, planificacion_semestre_id, seccion, cupos) values
        (100,'EXT100',1,1,1,20), (101,'EXT100',1,1,2,20), (102,'EXT200',1,1,1,20),
        (103,'INT100',3,1,1,20), (104,'EXT900',4,1,1,20), (105,'EXT100',1,2,1,20), (106,'EXT100',1,3,1,20)`;
      await sql`insert into horarios_asignaturas (oferta_id, bloque_id, tipo_hora_id, planificacion_semestre_id)
        select id, case when id=101 then 2 when id=102 then 3 else 1 end, 1, planificacion_semestre_id from ofertas_asignaturas`;
    });
  });

  async function archivo(filas: (string | number)[][]) {
    const libro = new ExcelJS.Workbook(); const hoja = libro.addWorksheet("Department schedules");
    hoja.addRow([...encabezados]); filas.forEach(fila => hoja.addRow(fila));
    return Buffer.from(await libro.xlsx.writeBuffer());
  }
  const filasValidas = () => [
    ["EXT100", "Linear Algebra", 1, 45, "11111111-1", "Replacement teacher", "t", "Lunes", "08:10-08:50"],
    ["EXT300", "Statistics", 3, 30, "11111111-1", "Replacement teacher", "t", "Martes", "08:10-08:50"],
  ];
  const importar = async (filas = filasValidas()) => servicio.importarExcelExternos(1, 1, await archivo(filas), usuario);
  const ofertas = () => cliente`select * from ofertas_asignaturas order by id`;
  const horarios = () => cliente`select * from horarios_asignaturas order by id`;
  async function huella() {
    const tablas = await cliente`select tablename from pg_tables where schemaname='public' order by tablename`;
    const datos: Record<string, string[]> = {};
    for (const { tablename } of tablas) {
      datos[tablename] = (await cliente`select to_jsonb(fila) as dato from ${cliente(tablename)} fila`)
        .map(fila => JSON.stringify(fila.dato)).sort();
    }
    // PostgreSQL sequences are intentionally excluded: nextval is not rolled back.
    return createHash("sha256").update(JSON.stringify(datos)).digest("hex");
  }

  it("replaces sections, preserves other scopes and offer IDs, and accepts opposite-parity offers", async () => {
    const ofertasAjenas = (await ofertas()).filter(oferta => oferta.id >= 103);
    const horariosAjenos = (await horarios()).filter(horario => horario.oferta_id >= 103);
    const catalogoAnterior = await cliente`select * from asignaturas order by codigo`;
    const filas = filasValidas(); filas[0]![1] = "Algebra abreviada"; filas[1]![1] = "";
    const resultado = await importar([...filas, ["EXT900", "Ignored", "invalid"], ["INT100", "Ignored", "invalid"]]);
    expect(resultado).toMatchObject({ ofertasCreadas: 1, ofertasActualizadas: 1, ofertasEliminadas: 2, horariosCreados: 2, errores: [],
      asignaturasCargadas: [
        { codigo: "EXT100", nombre: "Linear Algebra", semestreMalla: 2, secciones: [1] },
        { codigo: "EXT300", nombre: "Statistics", semestreMalla: 3, secciones: [3] },
      ] });
    const actuales = await ofertas();
    expect(actuales.filter(oferta => oferta.id >= 103)).toEqual(ofertasAjenas);
    expect((await horarios()).filter(horario => horario.oferta_id >= 103)).toEqual(horariosAjenos);
    expect(actuales.find(oferta => oferta.id === 100)).toMatchObject({ profesor_id: 2, cupos: 45 });
    expect(actuales.some(oferta => [101, 102].includes(oferta.id))).toBe(false);
    expect(actuales).toHaveLength(6);
    expect(await cliente`select * from asignaturas order by codigo`).toEqual(catalogoAnterior);
    expect((await horarios()).filter(horario => ![103,104,105,106].includes(horario.oferta_id)))
      .toEqual([expect.objectContaining({ oferta_id: 100, bloque_id: 1, sala_id: null }), expect.objectContaining({ bloque_id: 2, sala_id: null })]);
  });

  it("reimports without duplicate sections or schedule blocks", async () => {
    await importar(); const anteriores = await ofertas();
    const asociaciones = (filas: postgres.RowList<postgres.Row[]>) => filas.map(({ id: _, ...fila }) => JSON.stringify(fila)).sort();
    const horariosAnteriores = asociaciones(await horarios());
    expect(await importar()).toMatchObject({ ofertasCreadas: 0, ofertasActualizadas: 2, ofertasEliminadas: 0, errores: [] });
    expect(await ofertas()).toEqual(anteriores);
    expect(asociaciones(await horarios())).toEqual(horariosAnteriores);
  });

  it("reports the subject and invalid value without changing any persisted row", async () => {
    const anteriores = await huella(); const filas = filasValidas(); filas[1]![3] = -1;
    const resultado = await importar(filas);
    expect(resultado.errores).toEqual([expect.objectContaining({ fila: 3, columna: "Cupos", codigoAsignatura: "EXT300", nombreAsignatura: "Statistics", valor: "-1" })]);
    expect(await huella()).toBe(anteriores);
  });

  it("does not erase existing data when no relevant course is present", async () => {
    const anteriores = await huella();
    expect((await importar([["EXT900", "Ignored", "invalid"]])).errores).toContainEqual(expect.objectContaining({ columna: "archivo" }));
    expect(await huella()).toBe(anteriores);
  });

  it("rejects a published planning without changing persisted rows", async () => {
    await cliente`update planificaciones_semestres set estado_planificacion='publicado' where id=1`;
    const anteriores = await huella();
    await expect(importar()).rejects.toThrow(/preparación/);
    expect(await huella()).toBe(anteriores);
  });

  it("rolls back real deletes, updates and inserts after a late PostgreSQL failure", async () => {
    await cliente.unsafe(`create function fallar_excel_integracion() returns trigger language plpgsql as $$
      begin
        if new.bloque_id = 2 and exists (select 1 from ofertas_asignaturas where id=100 and cupos=45)
          and not exists (select 1 from ofertas_asignaturas where id in (101,102))
          and exists (select 1 from horarios_asignaturas where oferta_id=100 and bloque_id=1) then
          raise exception 'forced external Excel failure after persisted changes';
        end if;
        return new;
      end $$`);
    await cliente.unsafe("create trigger fallar_excel_integracion before insert on horarios_asignaturas for each row execute function fallar_excel_integracion()");
    try {
      const anteriores = await huella();
      await expect(importar()).rejects.toMatchObject({ cause: expect.objectContaining({ message: "forced external Excel failure after persisted changes" }) });
      expect(await huella()).toBe(anteriores);
    } finally {
      await cliente.unsafe("drop trigger fallar_excel_integracion on horarios_asignaturas");
      await cliente.unsafe("drop function fallar_excel_integracion()");
    }
  });
});
