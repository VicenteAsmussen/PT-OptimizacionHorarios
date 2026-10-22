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
  let servicioOfertas: typeof import("../../src/services/ofertas.service.js").ofertasService;
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
    ({ ofertasService: servicioOfertas } = await import("../../src/services/ofertas.service.js"));
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
      await sql`insert into tipos_hora (id, tipo) values (1,'Teórica'), (2,'Práctica'), (3,'Laboratorio')`;
      await sql`insert into bloques_horarios (id, dia, numero_bloque, hora_inicio, hora_termino) values
        (1,'Lunes',1,'08:10','08:50'), (2,'Martes',1,'08:10','08:50'), (3,'Miércoles',1,'08:10','08:50'),
        (4,'Jueves',1,'08:10','08:50'), (5,'Viernes',1,'08:10','08:50')`;
      await sql`insert into ofertas_asignaturas (id, asignatura_codigo, planificacion_semestre_id, seccion, cupos) values
        (100,'EXT100',1,1,20), (101,'EXT100',1,2,20), (102,'EXT200',1,1,20),
        (103,'INT100',1,1,20), (104,'EXT900',1,1,20), (105,'EXT100',2,1,20), (106,'EXT100',3,1,20)`;
      await sql`insert into oferta_tipo_hora (oferta_id, tipo_hora_id, profesor_id)
        select id, 1, case when id=103 then 3 when id=104 then 4 else 1 end from ofertas_asignaturas`;
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
    ["EXT200", "Calculus", 1, 30, "11111111-1", "Replacement teacher", "t", "Miércoles", "08:10-08:50"],
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
    expect(resultado).toMatchObject({ ofertasCreadas: 1, ofertasActualizadas: 2, ofertasEliminadas: 1, horariosCreados: 3, errores: [],
      asignaturasCargadas: [
        { codigo: "EXT100", nombre: "Linear Algebra", semestreMalla: 2, secciones: [1] },
        { codigo: "EXT200", nombre: "Calculus", semestreMalla: 4, secciones: [1] },
        { codigo: "EXT300", nombre: "Statistics", semestreMalla: 3, secciones: [3] },
      ] });
    const actuales = await ofertas();
    expect(actuales.filter(oferta => oferta.id >= 103)).toEqual(ofertasAjenas);
    expect((await horarios()).filter(horario => horario.oferta_id >= 103)).toEqual(horariosAjenos);
    expect(actuales.find(oferta => oferta.id === 100)).toMatchObject({ cupos: 45 });
    expect(await cliente`select * from oferta_tipo_hora where oferta_id=100`).toEqual([{ oferta_id: 100, tipo_hora_id: 1, profesor_id: 2 }]);
    expect(actuales.some(oferta => oferta.id === 101)).toBe(false);
    expect(actuales.find(oferta => oferta.id === 102)).toMatchObject({ cupos: 30 });
    expect(await cliente`select * from oferta_tipo_hora where oferta_id=102`).toEqual([{ oferta_id: 102, tipo_hora_id: 1, profesor_id: 2 }]);
    expect(actuales).toHaveLength(7);
    expect(await cliente`select * from asignaturas order by codigo`).toEqual(catalogoAnterior);
    expect((await horarios()).filter(horario => ![103,104,105,106].includes(horario.oferta_id)))
      .toEqual([expect.objectContaining({ oferta_id: 100, bloque_id: 1, sala_id: null }), expect.objectContaining({ bloque_id: 2, sala_id: null }), expect.objectContaining({ oferta_id: 102, bloque_id: 3, sala_id: null })]);
  });

  it("reimports without duplicate sections or schedule blocks", async () => {
    await importar(); const anteriores = await ofertas();
    const asociaciones = (filas: postgres.RowList<postgres.Row[]>) => filas.map(({ id: _, ...fila }) => JSON.stringify(fila)).sort();
    const horariosAnteriores = asociaciones(await horarios());
    expect(await importar()).toMatchObject({ ofertasCreadas: 0, ofertasActualizadas: 3, ofertasEliminadas: 0, errores: [] });
    expect(await ofertas()).toEqual(anteriores);
    expect(asociaciones(await horarios())).toEqual(horariosAnteriores);
  });

  it("keeps the Excel format and assigns the row teacher once per distinct session type", async () => {
    const filas = filasValidas();
    filas[0]!.push("", "p", "Jueves", "08:10-08:50", "", "p", "Viernes", "08:10-08:50");
    expect(await importar(filas)).toMatchObject({ errores: [], horariosCreados: 5 });
    expect(await cliente`select * from oferta_tipo_hora where oferta_id=100 order by tipo_hora_id`).toEqual([
      { oferta_id: 100, tipo_hora_id: 1, profesor_id: 2 }, { oferta_id: 100, tipo_hora_id: 2, profesor_id: 2 },
    ]);
    expect(await importar()).toMatchObject({ errores: [] });
    expect(await cliente`select * from oferta_tipo_hora where oferta_id=100`).toEqual([{ oferta_id: 100, tipo_hora_id: 1, profesor_id: 2 }]);
  });

  it("saves incomplete offers, replaces typed assignments and preserves omitted assignments", async () => {
    await cliente`insert into asignatura_tipo_hora (asignatura_codigo,tipo_hora_id,horas) values ('EXT300',1,4),('EXT300',2,2),('EXT300',3,2)`;
    const creada = await servicioOfertas.createOferta({ asignaturaCodigo: "EXT300", planificacionSemestreId: 1, seccion: 3, cupos: 20, asignaciones: [] });
    expect(creada.asignaciones).toEqual([]);
    const asignaciones = [1,2,3].map(tipoHoraId => ({ tipoHoraId, profesorId: tipoHoraId === 2 ? 2 : 1 }));
    const completa = await servicioOfertas.updateOferta(creada.id, { asignaciones });
    expect(completa.asignaciones.map(({ tipoHoraId, profesorId }) => ({ tipoHoraId, profesorId })).sort((a,b) => a.tipoHoraId-b.tipoHoraId)).toEqual(asignaciones);
    expect((await servicioOfertas.updateOferta(creada.id, { cupos: 25 })).asignaciones).toHaveLength(3);
    expect((await servicioOfertas.updateOferta(creada.id, { asignaciones: [] })).asignaciones).toEqual([]);
  });

  it("resolves teacher per scheduled type, filters without cross-type leakage and rejects reassignment conflicts atomically", async () => {
    await cliente`delete from horarios_asignaturas where planificacion_semestre_id=1`;
    await cliente`insert into asignatura_tipo_hora (asignatura_codigo,tipo_hora_id,horas) values ('EXT300',1,4),('EXT300',2,2),('EXT300',3,2)`;
    const asignaciones = [1,2,3].map(tipoHoraId => ({ tipoHoraId, profesorId: tipoHoraId === 2 ? 2 : 1 }));
    const oferta = await servicioOfertas.createOferta({ asignaturaCodigo: "EXT300", planificacionSemestreId: 1, seccion: 3, cupos: 20, asignaciones });
    for (const tipoHoraId of [1,2,3]) await servicio.createHorario({ ofertaId: oferta.id, planificacionSemestreId: 1, tipoHoraId, bloqueId: tipoHoraId, salaId: null });
    const propias = await servicio.getAllHorarios({ planificacionSemestreId: 1, profesorId: 1 });
    expect(propias.map(h => h.tipoHoraId).sort()).toEqual([1,3]);
    expect(propias.every(h => h.asignacion.profesorId === 1 && !("rut" in h.asignacion.profesor))).toBe(true);
    expect((await servicio.getAllHorarios({ planificacionSemestreId: 1, profesorId: 2 })).map(h => h.tipoHoraId)).toEqual([2]);
    const otra = await servicioOfertas.createOferta({ asignaturaCodigo: "EXT300", planificacionSemestreId: 1, seccion: 4, cupos: 20, asignaciones: [{ tipoHoraId: 1, profesorId: 2 }] });
    await servicio.createHorario({ ofertaId: otra.id, planificacionSemestreId: 1, tipoHoraId: 1, bloqueId: 1, salaId: null });
    const anterior = await huella();
    await expect(servicioOfertas.updateOferta(oferta.id, { asignaciones: asignaciones.map(a => ({ ...a, profesorId: 2 })) })).rejects.toThrow(/profesor ocupado/);
    expect(await huella()).toBe(anterior);
    await expect(servicioOfertas.updateOferta(oferta.id, { asignaciones: [] })).rejects.toThrow(/horarios asociados/);
    expect(await huella()).toBe(anterior);
    await expect(servicio.createHorario({ ofertaId: otra.id, planificacionSemestreId: 1, tipoHoraId: 3, bloqueId: 4, salaId: null })).rejects.toThrow(/profesor asignado/);
    expect(await huella()).toBe(anterior);
  });

  it("reports the subject and invalid value without changing any persisted row", async () => {
    const anteriores = await huella(); const filas = filasValidas(); filas[1]![3] = -1;
    const resultado = await importar(filas);
    expect(resultado.errores).toEqual([expect.objectContaining({ fila: 3, columna: "Cupos", codigoAsignatura: "EXT300", nombreAsignatura: "Statistics", valor: "-1" })]);
    expect(await huella()).toBe(anteriores);
  });

  it("enforces the assignment FK and unique type without changing persisted rows on rejection", async () => {
    const anterior = await huella();
    await expect(cliente`insert into horarios_asignaturas (oferta_id,tipo_hora_id,bloque_id,planificacion_semestre_id) values (100,3,4,1)`)
      .rejects.toMatchObject({ code: "23503", constraint_name: "fk_horarios_asignacion_docente" });
    expect(await huella()).toBe(anterior);
    await expect(cliente`insert into oferta_tipo_hora (oferta_id,tipo_hora_id,profesor_id) values (100,1,2)`)
      .rejects.toMatchObject({ code: "23505" });
    expect(await huella()).toBe(anterior);
  });

  it("keeps the shared offer when deleting its unscheduled teacher and isolates my schedule by type", async () => {
    await cliente`insert into oferta_tipo_hora (oferta_id,tipo_hora_id,profesor_id) values (100,2,2)`;
    await cliente`insert into usuarios (id,nombre,correo,clave,rol) values
      (2,'Teacher one','one@example.test','not-a-password','profesor'),
      (3,'Teacher two','two@example.test','not-a-password','profesor')`;
    await cliente`update profesores set usuario_id=2 where id=1`;
    await cliente`update profesores set usuario_id=3 where id=2`;
    const propias = await servicio.getMiHorario(2, { planificacionSemestreId: 1 });
    expect(propias.length).toBeGreaterThan(0);
    expect(propias.every(h => h.tipoHoraId === 1 && h.asignacion.profesorId === 1)).toBe(true);
    expect(JSON.stringify(propias)).not.toMatch(/"rut"|"clave"/);
    expect(await servicio.getMiHorario(3, { planificacionSemestreId: 1 })).toEqual([]);
    const { profesoresService } = await import("../../src/services/profesores.service.js");
    await profesoresService.deleteProfesor(2);
    const oferta = await servicioOfertas.getOfertaById(100);
    expect(oferta.asignaciones.map(a => a.profesorId)).toEqual([1]);
    expect(oferta.horarios).toHaveLength(1);
  });

  it("backfills existing scheduled types before removing the legacy teacher column", async () => {
    const anterior = await huella();
    const { readFileSync } = await import("node:fs");
    const migracion = readFileSync(new URL("../../src/db/migrations/0015_asignacion_docente_por_tipo_hora.sql", import.meta.url), "utf8");
    const rollback = new Error("Isolated migration rollback");
    await expect(cliente.begin(async sql => {
      await sql.unsafe("ALTER TABLE horarios_asignaturas DROP CONSTRAINT fk_horarios_asignacion_docente");
      await sql.unsafe("ALTER TABLE ofertas_asignaturas ADD COLUMN profesor_id integer NOT NULL DEFAULT 1");
      await sql.unsafe("ALTER TABLE ofertas_asignaturas ADD CONSTRAINT ofertas_asignaturas_profesor_id_profesores_id_fk FOREIGN KEY (profesor_id) REFERENCES profesores(id)");
      await sql.unsafe("ALTER TABLE horarios_asignaturas ADD CONSTRAINT horarios_asignaturas_tipo_hora_id_tipos_hora_id_fk FOREIGN KEY (tipo_hora_id) REFERENCES tipos_hora(id)");
      await sql.unsafe("DROP TABLE oferta_tipo_hora");
      const esperadas = await sql`select distinct o.id as oferta_id,h.tipo_hora_id,o.profesor_id from ofertas_asignaturas o join horarios_asignaturas h on h.oferta_id=o.id order by oferta_id,tipo_hora_id`;
      for (const instruccion of migracion.split("--> statement-breakpoint")) if (instruccion.trim()) await sql.unsafe(instruccion);
      expect(await sql`select * from oferta_tipo_hora order by oferta_id,tipo_hora_id`).toEqual(esperadas);
      expect(esperadas.length).toBeGreaterThan(0);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await huella()).toBe(anterior);
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
          and not exists (select 1 from ofertas_asignaturas where id=101)
          and not exists (select 1 from horarios_asignaturas where oferta_id=102)
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
  it.each([['2099-2', 'EXT200'], ['2099-1', 'EXT300']])('rejects missing mandatory courses in %s with identical persisted data', async (periodo, codigo) => {
    await cliente`update planificaciones_semestres set codigo='2098-1' where id=2`;
    await cliente`update planificaciones_semestres set codigo=${periodo} where id=1`;
    const anterior = await huella();
    const resultado = await importar(filasValidas().filter(fila => fila[0] !== codigo));
    expect(resultado.errores).toContainEqual(expect.objectContaining({ columna: 'Cobertura', codigoAsignatura: codigo }));
    expect(await huella()).toBe(anterior);
  });
  it('reads persisted scoped coverage and accepts missing optional courses', async () => {
    const antes = await servicio.coberturaExcelExternos(1, 1, usuario);
    expect(antes.cobertura.map(asignatura => asignatura.codigo).sort()).toEqual(['EXT100', 'EXT200', 'EXT300']);
    expect(antes.cobertura.find(asignatura => asignatura.codigo === 'EXT300')).toMatchObject({ estado: 'faltante_opcional' });
    const resultado = await importar(filasValidas().filter(fila => fila[0] !== 'EXT300'));
    expect(resultado.errores).toEqual([]);
    const despues = await servicio.coberturaExcelExternos(1, 1, usuario);
    expect(despues.cobertura.filter(asignatura => asignatura.estado === 'cargada')).toHaveLength(2);
    await expect(servicio.coberturaExcelExternos(3, 1, usuario)).rejects.toThrow(/carrera/);
  });
});
