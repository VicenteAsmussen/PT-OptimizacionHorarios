import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import request, { type Test } from "supertest";
import type { Express } from "express";
import { exigirBasePruebas } from "../soporte/base-pruebas.js";

const habilitado = process.env.BASE_PRUEBAS_REINICIABLE !== undefined;
if (habilitado) exigirBasePruebas(process.env);
describe.skipIf(!habilitado)("Period administration on isolated PostgreSQL", () => {
  let cliente: ReturnType<typeof postgres>;
  let cerrar: () => Promise<void>;
  let app: Express;
  let token: string;
  const raiz = "/api/administracion-periodos/1";
  beforeAll(async () => {
    cliente = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const [destino] = await cliente`select current_database() as base, current_user as usuario, pg_try_advisory_lock(18874001, 1) as bloqueo`;
    if (destino.base !== "horarios_test" || destino.usuario !== "pruebas_horarios" || !destino.bloqueo) {
      throw new Error("An isolated, exclusively held test database is required.");
    }
    await migrate(drizzle(cliente), { migrationsFolder: fileURLToPath(new URL("../../src/db/migrations", import.meta.url)) });
    const { queryClient } = await import("../../src/config/db.js");
    cerrar = () => queryClient.end();
    ({ app } = await import("../../src/app.js"));
    const { generateToken } = await import("../../src/utils/jwt.js");
    token = generateToken({ id: 1, nombre: "Test administrator", correo: "admin@example.test", rol: "admin" });
  }, 30000);
  afterAll(async () => { try { await cerrar?.(); } finally { await cliente?.end(); } });
  beforeEach(async () => {
    // Never enabled for the development database: the raw environment and DB identity were checked above.
    await cliente`truncate carreras, departamentos, usuarios, bloques_horarios, tipos_hora, salas restart identity cascade`;
    await cliente.begin(async sql => {
      await sql`insert into carreras (id,nombre) values (1,'Career A'),(2,'Career B')`;
      await sql`insert into departamentos (id,nombre) values (1,'Managed'),(2,'External')`;
      await sql`insert into carrera_departamento (carrera_id,departamento_id,es_gestionado) values (1,1,true),(1,2,false),(2,1,false)`;
      await sql`insert into asignaturas (codigo,nombre,departamento_id,semestre_malla) values ('INT','Managed subject',1,2),('EXT','External subject',2,2)`;
      await sql`insert into carrera_asignatura (carrera_id,asignatura_codigo) values (1,'INT'),(1,'EXT'),(2,'INT')`;
      await sql`insert into profesores (id,departamento_id,rut,nombre,tipo) values (1,1,'12345678-5','Test teacher','planta')`;
      await sql`insert into planificaciones_semestres (id,carrera_id,codigo,actual,estado_planificacion) values
        (1,1,'2099-2',true,'publicado'),(2,1,'2099-1',false,'propuesta'),(3,2,'2099-2',true,'preparacion')`;
      await sql`insert into tipos_hora (id,tipo) values (1,'Teórica')`;
      await sql`insert into asignatura_tipo_hora (asignatura_codigo,tipo_hora_id,horas) values ('INT',1,1),('EXT',1,1)`;
      await sql`insert into bloques_horarios (id,dia,numero_bloque,hora_inicio,hora_termino) values (1,'Lunes',1,'08:10','08:50')`;
      await sql`insert into salas (id,nombre,capacidad,tipo) values (1,'Test room',30,'Aula')`;
      await sql`insert into ofertas_asignaturas (id,asignatura_codigo,planificacion_semestre_id,seccion,cupos) values
        (10,'INT',1,1,20),(11,'INT',1,2,20),(12,'EXT',1,1,20),(13,'INT',2,1,20),(14,'INT',3,1,20)`;
      await sql`insert into oferta_tipo_hora (oferta_id,tipo_hora_id,profesor_id) select id,1,1 from ofertas_asignaturas`;
      await sql`insert into horarios_asignaturas (oferta_id,tipo_hora_id,planificacion_semestre_id,bloque_id) select id,1,planificacion_semestre_id,1 from ofertas_asignaturas`;
      await sql`insert into disponibilidad_profesores (profesor_id,planificacion_semestre_id,bloque_id) values (1,1,1)`;
    });
  });
  const autorizada = (solicitud: Test) => solicitud.set("Authorization", `Bearer ${token}`);
  async function resumen(alcance = "gestionadas", id = 1) {
    const respuesta = await autorizada(request(app).get(`/api/administracion-periodos/${id}/resumen?alcance=${alcance}`));
    expect(respuesta.status).toBe(200);
    return respuesta.body.data;
  }
  async function huellaDatos() {
    const tablas = await cliente`select tablename from pg_tables where schemaname='public' order by tablename`;
    const datos = [];
    for (const { tablename } of tablas) datos.push([tablename,
      (await cliente`select to_jsonb(fila) as dato from ${cliente(tablename)} fila`).map(fila => JSON.stringify(fila.dato)).sort()]);
    return createHash("sha256").update(JSON.stringify(datos)).digest("hex");
  }
  async function preservados() {
    return {
      planes: await cliente`select * from planificaciones_semestres order by id`,
      ofertas: await cliente`select * from ofertas_asignaturas where planificacion_semestre_id<>1 order by id`,
      horarios: await cliente`select * from horarios_asignaturas where planificacion_semestre_id<>1 order by id`,
      asignaciones: await cliente`select * from oferta_tipo_hora where oferta_id in (13,14) order by oferta_id`,
      disponibilidad: await cliente`select * from disponibilidad_profesores`,
      materias: await cliente`select * from asignaturas order by codigo`, profesores: await cliente`select * from profesores`, salas: await cliente`select * from salas`,
    };
  }
  it.each(["gestionadas", "externas", "todas"])("deletes complete offers only within %s and preserves every other planning and catalog", async alcance => {
    const anterior = await resumen(alcance);
    expect((await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ alcance, objetivo: "horarios", confirmacion: "2099-2", huella: anterior.huella })).status).toBe(200);
    const antes = await preservados();
    const vista = await resumen(alcance);
    const cantidad = alcance === "gestionadas" ? 2 : alcance === "externas" ? 1 : 3;
    const restantes = alcance === "gestionadas" ? [12] : alcance === "externas" ? [10, 11] : [];
    expect(vista).toMatchObject({ ofertas: cantidad, asignaciones: cantidad, horarios: 0, planificacion: { carreraId: 1, estadoPlanificacion: "publicado" } });
    const respuesta = await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ alcance, objetivo: "ofertas", confirmacion: "2099-2", huella: vista.huella });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ ofertas: cantidad, asignaciones: cantidad, horarios: 0 });
    expect(await preservados()).toEqual(antes);
    expect((await cliente`select id from ofertas_asignaturas where planificacion_semestre_id=1 order by id`).map(fila => fila.id)).toEqual(restantes);
    expect((await resumen(alcance)).ofertas).toBe(0);
    expect((await cliente`select oferta_id from oferta_tipo_hora where oferta_id in (10,11,12) order by oferta_id`).map(fila => fila.oferta_id)).toEqual(restantes);
    expect((await cliente`select oferta_id from horarios_asignaturas where planificacion_semestre_id=1 order by oferta_id`).map(fila => fila.oferta_id)).toEqual(restantes);
  });
  it.each(["gestionadas", "externas", "todas"])("refuses offer reset in %s until its schedules are reset, with unchanged database hash", async alcance => {
    const vista = await resumen(alcance); const antes = await huellaDatos();
    const respuesta = await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ alcance, objetivo: "ofertas", confirmacion: "2099-2", huella: vista.huella });
    expect(respuesta.status).toBe(409); expect(respuesta.body.message).toContain("horarios");
    expect(await huellaDatos()).toBe(antes);
  });
  it.each(["vacio", "ofertas", "externos"])("keeps preparation and refuses proposal/publication with %s only", async escenario => {
    await cliente`update planificaciones_semestres set estado_planificacion='preparacion' where id=1`;
    if (escenario === "externos") await cliente`delete from horarios_asignaturas where planificacion_semestre_id=1 and oferta_id<>12`;
    else await cliente`delete from horarios_asignaturas where planificacion_semestre_id=1`;
    if (escenario === "vacio") await cliente`delete from ofertas_asignaturas where planificacion_semestre_id=1`;
    const antes = await huellaDatos();
    for (const estadoPlanificacion of ["propuesta", "publicado"]) {
      const respuesta = await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior: "preparacion", estadoPlanificacion });
      expect(respuesta.status).toBe(409); expect(respuesta.body.message).toContain("horarios de asignaturas gestionadas");
      expect(await huellaDatos()).toBe(antes);
    }
  });
  it("admin enters proposal and switches freely to published without load or room validation", async () => {
    await cliente`update planificaciones_semestres set estado_planificacion='preparacion' where id=1`;
    await cliente`update asignatura_tipo_hora set horas=20`;
    const antes = await huellaDatos();
    let estadoAnterior = "preparacion";
    for (const estadoPlanificacion of ["propuesta", "publicado", "propuesta", "publicado"]) {
      const respuesta = await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior, estadoPlanificacion });
      expect(respuesta.status).toBe(200); estadoAnterior = estadoPlanificacion;
    }
    await cliente`update planificaciones_semestres set estado_planificacion='preparacion' where id=1`;
    expect(await huellaDatos()).toBe(antes);
  });
  it("rejects returning to proposal/published after a formerly valid managed preview becomes empty", async () => {
    expect((await resumen("gestionadas")).horarios).toBe(2);
    await cliente`delete from horarios_asignaturas where planificacion_semestre_id=1 and oferta_id<>12`;
    const antes = await huellaDatos();
    expect((await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior: "publicado", estadoPlanificacion: "propuesta" })).status).toBe(409);
    expect(await huellaDatos()).toBe(antes);
  });
  it.each(["gestionadas", "externas", "todas"])("schedule reset preserves offers and assignments for %s", async alcance => {
    const antes = await preservados();
    const ofertas = await cliente`select * from ofertas_asignaturas order by id`;
    const asignaciones = await cliente`select * from oferta_tipo_hora order by oferta_id`;
    const vista = await resumen(alcance);
    const respuesta = await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ alcance, objetivo: "horarios", confirmacion: "2099-2", huella: vista.huella });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ ofertas: 0, asignaciones: 0, horarios: alcance === "gestionadas" ? 2 : alcance === "externas" ? 1 : 3 });
    expect(await cliente`select * from ofertas_asignaturas order by id`).toEqual(ofertas);
    expect(await cliente`select * from oferta_tipo_hora order by oferta_id`).toEqual(asignaciones);
    expect(await preservados()).toEqual(antes);
    expect((await resumen(alcance)).horarios).toBe(0);
  });
  it.each(["preparacion", "propuesta", "publicado"])("applies transitions from %s without bypassing the schedule guard", async estadoAnterior => {
    for (const estadoPlanificacion of ["preparacion", "propuesta", "publicado"]) {
      await cliente`update planificaciones_semestres set estado_planificacion=${estadoAnterior} where id=1`;
      const huellaAnterior = await huellaDatos();
      const antes = await preservados();
      const respuesta = await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior, estadoPlanificacion });
      if (estadoPlanificacion === "preparacion" && estadoAnterior !== "preparacion") {
        expect(respuesta.status).toBe(409);
        expect(await huellaDatos()).toBe(huellaAnterior);
        continue;
      }
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data).toMatchObject({ id: 1, carreraId: 1, codigo: "2099-2", actual: true, estadoPlanificacion });
      const despues = await preservados();
      antes.planes[0].estado_planificacion = estadoPlanificacion;
      expect(despues).toEqual(antes);
      await cliente`update planificaciones_semestres set estado_planificacion=${estadoAnterior} where id=1`;
      expect(await huellaDatos()).toBe(huellaAnterior);
    }
  });
  it.each([10, 12])("return to preparation is blocked only by a remaining managed schedule on offer %s", async ofertaId => {
    await cliente`delete from horarios_asignaturas where planificacion_semestre_id=1 and oferta_id<>${ofertaId}`;
    const antes = await huellaDatos();
    const respuesta = await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior: "publicado", estadoPlanificacion: "preparacion" });
    expect(respuesta.status).toBe(ofertaId === 10 ? 409 : 200);
    if (ofertaId === 10) expect(respuesta.body.message).toContain("gestionados");
    if (ofertaId === 12) await cliente`update planificaciones_semestres set estado_planificacion='publicado' where id=1`;
    expect(await huellaDatos()).toBe(antes);
  });
  it.each(["propuesta", "publicado"])("returns from %s after resetting managed schedules, preserving external schedules and teachers", async estadoAnterior => {
    await cliente`update planificaciones_semestres set estado_planificacion=${estadoAnterior} where id=1`;
    const vista = await resumen("gestionadas");
    expect((await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ objetivo: "horarios", alcance: "gestionadas", confirmacion: "2099-2", huella: vista.huella })).status).toBe(200);
    const antes = await huellaDatos();
    const respuesta = await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior, estadoPlanificacion: "preparacion" });
    expect(respuesta.status).toBe(200);
    expect((await resumen("externas")).horarios).toBe(1);
    expect((await resumen("todas")).ofertas).toBe(3);
    expect((await resumen("todas")).asignaciones).toBe(3);
    await cliente`update planificaciones_semestres set estado_planificacion=${estadoAnterior} where id=1`;
    expect(await huellaDatos()).toBe(antes);
  });
  it("returns to preparation once this period is empty even if other periods/careers retain schedules", async () => {
    await cliente`delete from horarios_asignaturas where planificacion_semestre_id=1`;
    const anteriores = await preservados();
    const respuesta = await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior: "publicado", estadoPlanificacion: "preparacion" });
    expect(respuesta.status).toBe(200);
    anteriores.planes[0].estado_planificacion = "preparacion";
    expect(await preservados()).toEqual(anteriores);
  });
  it("external reset excludes unclassified departments instead of broadening the destructive scope", async () => {
    await cliente`delete from carrera_departamento where carrera_id=1 and departamento_id=2`;
    const vista = await resumen("externas");
    const antes = await huellaDatos();
    expect(vista.ofertas).toBe(0);
    const respuesta = await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ objetivo: "ofertas", alcance: "externas", confirmacion: "2099-2", huella: vista.huella });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ ofertas: 0, asignaciones: 0, horarios: 0 });
    expect(await huellaDatos()).toBe(antes);
  });
  it("rejects changed rows, management scope, state or incorrect confirmation without further mutations", async () => {
    for (const cambio of ["cupos", "gestion", "estado", "confirmacion", "alcance"]) {
      const vista = await resumen();
      if (cambio === "cupos") await cliente`update ofertas_asignaturas set cupos=cupos+1 where id=10`;
      if (cambio === "gestion") await cliente`update carrera_departamento set es_gestionado=false where carrera_id=1 and departamento_id=1`;
      if (cambio === "estado") await cliente`update planificaciones_semestres set estado_planificacion='preparacion' where id=1`;
      const antes = await huellaDatos();
      const respuesta = await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ objetivo: "ofertas", alcance: cambio === "alcance" ? "todas" : "gestionadas", huella: vista.huella, confirmacion: cambio === "confirmacion" ? "2099-1" : "2099-2" });
      expect(respuesta.status).toBe(409);
      expect(await huellaDatos()).toBe(antes);
    }
    const antes = await huellaDatos();
    expect((await autorizada(request(app).patch(`${raiz}/estado`)).send({ estadoAnterior: "publicado", estadoPlanificacion: "propuesta" })).status).toBe(409);
    expect(await huellaDatos()).toBe(antes);
  });
  it("serializes concurrent resets: only one stale snapshot can be consumed", async () => {
    const vista = await resumen();
    const reiniciar = () => autorizada(request(app).post(`${raiz}/reiniciar`)).send({ objetivo: "horarios", alcance: "gestionadas", huella: vista.huella, confirmacion: "2099-2" });
    const respuestas = await Promise.all([reiniciar(), reiniciar()]);
    expect(respuestas.map(respuesta => respuesta.status).sort()).toEqual([200, 409]);
    expect((await resumen()).horarios).toBe(0);
  });
  it("rolls back assignment deletions on a later offer deletion failure after schedules were reset", async () => {
    await cliente`delete from horarios_asignaturas where planificacion_semestre_id=1`;
    const vista = await resumen();
    const antes = await huellaDatos();
    await cliente`create function impedir_reinicio_prueba() returns trigger language plpgsql as $$ begin raise exception 'simulated late failure'; end $$`;
    await cliente`create trigger impedir_reinicio_prueba before delete on ofertas_asignaturas for each row execute function impedir_reinicio_prueba()`;
    try {
      const respuesta = await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ objetivo: "ofertas", alcance: "gestionadas", huella: vista.huella, confirmacion: "2099-2" });
      expect(respuesta.status).toBe(500);
      expect(await huellaDatos()).toBe(antes);
    } finally {
      await cliente`drop trigger impedir_reinicio_prueba on ofertas_asignaturas`;
      await cliente`drop function impedir_reinicio_prueba()`;
    }
  });
  it("handles empty managed scopes without expanding to all offers, and missing plans return 404", async () => {
    await cliente`delete from carrera_departamento where carrera_id=1`;
    const vista = await resumen();
    const antes = await huellaDatos();
    const respuesta = await autorizada(request(app).post(`${raiz}/reiniciar`)).send({ objetivo: "ofertas", alcance: "gestionadas", huella: vista.huella, confirmacion: "2099-2" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ ofertas: 0, asignaciones: 0, horarios: 0 });
    expect(await huellaDatos()).toBe(antes);
    expect((await autorizada(request(app).get("/api/administracion-periodos/404/resumen?alcance=todas"))).status).toBe(404);
  });
  it("enforces real authentication and administrator authorization without changing any data", async () => {
    const { generateToken } = await import("../../src/utils/jwt.js");
    const antes = await huellaDatos();
    const vista = await resumen();
    for (const rol of [null, "secretaria", "profesor"] as const) {
      const credencial = rol ? generateToken({ id: 1, nombre: "Test user", correo: "user@example.test", rol }) : null;
      const solicitudes = [request(app).get(`${raiz}/resumen?alcance=todas`),
        request(app).post(`${raiz}/reiniciar`).send({ alcance: "gestionadas", objetivo: "ofertas", huella: vista.huella, confirmacion: "2099-2" }),
        request(app).patch(`${raiz}/estado`).send({ estadoAnterior: "publicado", estadoPlanificacion: "preparacion" })];
      for (const solicitud of solicitudes) {
        if (credencial) solicitud.set("Authorization", `Bearer ${credencial}`);
        expect((await solicitud).status).toBe(rol ? 403 : 401);
        expect(await huellaDatos()).toBe(antes);
      }
    }
  });
});
