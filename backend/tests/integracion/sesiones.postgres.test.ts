import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import request from "supertest";
import type { Express } from "express";
import { habilitarPruebasIntegracion, exigirBasePruebas } from "../soporte/base-pruebas.js";
import { hashPassword } from "../../src/utils/password.js";

// Ningún import estático carga app, configuración, dotenv ni clientes de producción.
const habilitado = habilitarPruebasIntegracion(process.env);
if (habilitado) {
  exigirBasePruebas(process.env);
  if (process.env.PRUEBAS_EN_EJECUCION !== "yes") throw new Error("Falta la guardia de ejecución de pruebas");
}

describe.skipIf(!habilitado)("Sesiones HTTP en PostgreSQL nuevo y descartable", () => {
  let cliente: ReturnType<typeof postgres>;
  let escritor: ReturnType<typeof postgres>;
  let app: Express;
  let configuracion: typeof import("../../src/config/db.js");
  let repositorio: typeof import("../../src/repositories/usuarios.repository.js").usuariosRepository;
  let esquema: typeof import("../../src/db/schema/index.js");
  let verificar: typeof import("../../src/utils/jwt.js").verifyToken;
  let claveHash: string;
  let cuentaPrevia: number;
  let huellaPrevia: string;
  const clave = "Clave-sintetica-solo-fixture-2026";
  const migraciones = fileURLToPath(new URL("../../src/db/migrations", import.meta.url));
  type Cuenta = { id: number; correo: string };
  type Acceso = { cookie: string; token: string; sid: string };
  const huella = (datos: unknown) => createHash("sha256").update(JSON.stringify(datos)).digest("hex");

  beforeAll(async () => {
    cliente = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const [destino] = await cliente`
      select current_database() as base, current_user as usuario,
        r.rolsuper, r.rolcreatedb, pg_get_userbyid(d.datdba) as propietario,
        pg_try_advisory_lock(18874001, 1) as bloqueo
      from pg_roles r join pg_database d on d.datname=current_database()
      where r.rolname=current_user`;
    expect(destino).toMatchObject({ base: "horarios_test", usuario: "pruebas_horarios",
      rolsuper: false, rolcreatedb: false, propietario: "pruebas_horarios", bloqueo: true });
    const tablas = await cliente`select tablename from pg_tables where schemaname='public'`;
    const diario = await cliente`select 1 from pg_namespace where nspname='drizzle'`;
    if (tablas.length || diario.length) throw new Error("La base debe estar vacía, no se migrará ni borrará su contenido");

    const registro = JSON.parse(await readFile(join(migraciones, "meta/_journal.json"), "utf8"));
    expect(registro.entries.length).toBe(21);
    const anteriores = registro.entries.filter((entrada: { idx: number }) => entrada.idx < 20);
    expect(anteriores.length).toBe(20);
    const carpeta = await mkdtemp(join(tmpdir(), "sesiones-migraciones-"));
    try {
      await mkdir(join(carpeta, "meta"));
      await writeFile(join(carpeta, "meta/_journal.json"), JSON.stringify({ ...registro, entries: anteriores }));
      for (const entrada of anteriores) await copyFile(join(migraciones, `${entrada.tag}.sql`), join(carpeta, `${entrada.tag}.sql`));
      // Un fallo heredado aborta beforeAll, nunca se reintenta ni se altera el SQL.
      await migrate(drizzle(cliente), { migrationsFolder: carpeta });
      expect((await cliente`select count(*)::int as cantidad from drizzle.__drizzle_migrations`)[0].cantidad).toBe(20);
      claveHash = await hashPassword(clave);
      const [previa] = await cliente`insert into usuarios (nombre,correo,clave,rol)
        values ('Cuenta previa sintética','previa@example.test',${claveHash},'admin') returning *`;
      cuentaPrevia = previa.id;
      huellaPrevia = huella(previa);
      await migrate(drizzle(cliente), { migrationsFolder: migraciones });
      expect((await cliente`select count(*)::int as cantidad from drizzle.__drizzle_migrations`)[0].cantidad).toBe(21);
      const [conservada] = await cliente`select * from usuarios where id=${cuentaPrevia}`;
      const { version_sesion, ...datosPrevios } = conservada;
      expect(version_sesion).toBe(0);
      expect(huella(datosPrevios) === huellaPrevia).toBe(true);
      expect((await cliente`select to_regclass('public.sesiones') is not null as existe`)[0].existe).toBe(true);
      expect((await cliente`select 1 from pg_constraint where conrelid='sesiones'::regclass
        and confrelid='usuarios'::regclass and contype='f' and confdeltype='c'`).length).toBe(1);
      expect((await cliente`select 1 from pg_indexes where schemaname='public' and tablename='sesiones'
        and indexname='sesiones_usuario_id_idx' and indexdef like '%(usuario_id)%'`).length).toBe(1);
      console.info("Migraciones efímeras: 0000–0019=20, 0020=21, cuenta previa conservada con versión 0");
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
    // La aplicación real se carga únicamente después de completar todo el esquema.
    configuracion = await import("../../src/config/db.js");
    ({ app } = await import("../../src/app.js"));
    ({ usuariosRepository: repositorio } = await import("../../src/repositories/usuarios.repository.js"));
    esquema = await import("../../src/db/schema/index.js");
    ({ verifyToken: verificar } = await import("../../src/utils/jwt.js"));
    escritor = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  }, 60000);

  afterAll(async () => {
    await Promise.all([
      configuracion?.queryClient.end({ timeout: 5 }),
      escritor?.end({ timeout: 5 }), cliente?.end({ timeout: 5 }),
    ]);
  });

  async function crearCuenta(nombre: string, rol: "admin" | "profesor" = "admin"): Promise<Cuenta> {
    const correo = `${nombre}@example.test`;
    const [cuenta] = await cliente`insert into usuarios (nombre,correo,clave,rol)
      values (${nombre},${correo},${claveHash},${rol}) returning id,correo`;
    return cuenta as Cuenta;
  }
  async function login(cuenta: Cuenta): Promise<Acceso> {
    const respuesta = await request(app).post("/api/auth/login").send({ correo: cuenta.correo, clave });
    expect(respuesta.status).toBe(200);
    const cookies = respuesta.headers["set-cookie"] as unknown as string[];
    const cookie = cookies?.find(valor => valor.startsWith("auth_token="))?.split(";")[0];
    expect(Boolean(cookie)).toBe(true);
    const token = decodeURIComponent(cookie!.slice("auth_token=".length));
    return { cookie: cookie!, token, sid: verificar(token).sid };
  }
  const me = (acceso: Acceso, bearer = false) => request(app).get("/api/auth/me")
    .set(bearer ? "Authorization" : "Cookie", bearer ? `Bearer ${acceso.token}` : acceso.cookie);
  const sesionesDe = async (id: number) => (await cliente`select id from sesiones where usuario_id=${id} order by id`).map(fila => fila.id as string);
  async function estado(id: number) {
    const [usuario] = await cliente`select * from usuarios where id=${id}`;
    const sesiones = await cliente`select * from sesiones where usuario_id=${id} order by id`;
    return huella({ usuario, sesiones });
  }
  function barrera<T>() {
    let resolver!: (valor: T) => void;
    const promesa = new Promise<T>(resuelve => { resolver = resuelve; });
    return { promesa, resolver };
  }

  it("conserva una cuenta de 0019 y permite login tras aplicar 0020", async () => {
    const acceso = await login({ id: cuentaPrevia, correo: "previa@example.test" });
    expect((await me(acceso)).status).toBe(200);
    expect((await sesionesDe(cuentaPrevia)).includes(acceso.sid)).toBe(true);
  });

  it("logout por cookie revoca solo A, rechaza su cookie y bearer y conserva B", async () => {
    const cuenta = await crearCuenta("logout");
    const a = await login(cuenta), b = await login(cuenta);
    expect(a.sid !== b.sid).toBe(true);
    for (let intento = 0; intento < 2; intento++) {
      const respuesta = await request(app).post("/api/auth/logout").set("Cookie", a.cookie);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ status: "success", message: "Sesión cerrada correctamente" });
      expect((await me(a)).status).toBe(401);
      expect((await me(a, true)).status).toBe(401);
      expect((await me(b)).status).toBe(200);
      expect((await sesionesDe(cuenta.id)).length).toBe(1);
      expect((await sesionesDe(cuenta.id))[0] === b.sid).toBe(true);
    }
  });

  it("otro admin cambia rol y revoca ambas sesiones, volver al rol no las revive", async () => {
    const actor = await login(await crearCuenta("actor-rol"));
    const cuenta = await crearCuenta("cambio-rol");
    const a = await login(cuenta), b = await login(cuenta);
    for (const [indice, rol] of ["profesor", "admin"].entries()) {
      const respuesta = await request(app).put(`/api/usuarios/${cuenta.id}`).set("Cookie", actor.cookie).send({ rol });
      expect(respuesta.status).toBe(200);
      expect((await cliente`select rol,version_sesion from usuarios where id=${cuenta.id}`)[0])
        .toEqual({ rol, version_sesion: indice + 1 });
      expect(await sesionesDe(cuenta.id)).toEqual([]);
      expect((await me(a)).status).toBe(401);
      expect((await me(b, true)).status).toBe(401);
      expect((await me(actor)).status).toBe(200);
    }
  });

  it("otro admin da de baja la cuenta y la FK elimina todas sus sesiones", async () => {
    const actor = await login(await crearCuenta("actor-baja"));
    const cuenta = await crearCuenta("baja");
    const a = await login(cuenta), b = await login(cuenta);
    const respuesta = await request(app).delete(`/api/usuarios/${cuenta.id}`).set("Cookie", actor.cookie);
    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe("");
    expect(await cliente`select id from usuarios where id=${cuenta.id}`).toHaveLength(0);
    expect(await sesionesDe(cuenta.id)).toEqual([]);
    expect((await me(a)).status).toBe(401);
    expect((await me(b, true)).status).toBe(401);
    expect((await me(actor)).status).toBe(200);
  });

  it("un fallo real al revocar revierte rol, versión y sesiones atómicamente", async () => {
    const actor = await login(await crearCuenta("actor-rollback"));
    const cuenta = await crearCuenta("rollback");
    const a = await login(cuenta), b = await login(cuenta);
    const antes = await estado(cuenta.id);
    await cliente.unsafe(`CREATE FUNCTION fallo_revocacion_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF OLD.usuario_id = ${cuenta.id} THEN RAISE EXCEPTION 'Fallo sintético de revocación'; END IF;
      RETURN OLD; END $$`);
    try {
      await cliente`CREATE TRIGGER fallo_revocacion_fixture BEFORE DELETE ON sesiones
        FOR EACH ROW EXECUTE FUNCTION fallo_revocacion_fixture()`;
      try {
        const respuesta = await request(app).put(`/api/usuarios/${cuenta.id}`).set("Cookie", actor.cookie).send({ rol: "profesor" });
        expect(respuesta.status).toBe(500);
        expect(respuesta.body).toEqual({ status: "error", statusCode: 500, message: "Internal server error" });
        expect(await estado(cuenta.id)).toBe(antes);
        expect((await me(a)).status).toBe(200);
        expect((await me(b, true)).status).toBe(200);
        expect((await me(actor)).status).toBe(200);
      } finally {
        await cliente`DROP TRIGGER fallo_revocacion_fixture ON sesiones`;
      }
    } finally {
      await cliente`DROP FUNCTION fallo_revocacion_fixture()`;
    }
  });

  it.each([false, true])("login con credenciales antiguas espera el bloqueo y se rechaza, ida y vuelta=%s", async idaVuelta => {
    const cuenta = await crearCuenta(idaVuelta ? "carrera-ida-vuelta" : "carrera-rol");
    const previo = await login(cuenta);
    const preparada = barrera<number>(), liberar = barrera<void>();
    const transaccion = drizzle(escritor, { schema: esquema }).transaction(async tx => {
      await repositorio.updateEnTransaccion(tx, cuenta.id, { rol: "profesor" });
      if (idaVuelta) await repositorio.updateEnTransaccion(tx, cuenta.id, { rol: "admin" });
      const [fila] = await escritorConsultaPid(tx);
      preparada.resolver(fila.pid);
      await liberar.promesa;
    });
    let solicitud: Promise<request.Response> | undefined;
    try {
      const pid = await Promise.race([preparada.promesa, transaccion.then(() => { throw new Error("La transacción terminó antes de la barrera"); })]);
      solicitud = request(app).post("/api/auth/login").send({ correo: cuenta.correo, clave }).then(respuesta => respuesta);
      const limite = Date.now() + 5000;
      let observado = false;
      do {
        const bloqueados = await cliente`select pid from pg_stat_activity
          where datname=current_database() and usename=current_user and state='active'
          and wait_event_type='Lock' and ${pid}::int=any(pg_blocking_pids(pid))
          and query ilike '%usuarios%' and query ilike '%for update%'`;
        observado = bloqueados.length === 1;
        // Cada consulta asíncrona cede al servidor, el orden depende del bloqueo observado, no de sleep.
      } while (!observado && Date.now() < limite);
      expect(observado).toBe(true);
      liberar.resolver();
      await transaccion;
      const respuesta = await solicitud;
      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toEqual({ status: "error", statusCode: 401, message: "Credenciales inválidas" });
      expect(respuesta.headers["set-cookie"] === undefined).toBe(true);
      expect(await sesionesDe(cuenta.id)).toEqual([]);
      expect((await cliente`select rol,version_sesion from usuarios where id=${cuenta.id}`)[0])
        .toEqual({ rol: idaVuelta ? "admin" : "profesor", version_sesion: idaVuelta ? 2 : 1 });
      expect((await me(previo)).status).toBe(401);
    } finally {
      liberar.resolver();
      await Promise.allSettled([transaccion, ...(solicitud ? [solicitud] : [])]);
    }
  });

  async function escritorConsultaPid(tx: Parameters<typeof repositorio.updateEnTransaccion>[0]) {
    const { sql } = await import("drizzle-orm");
    return tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  }
});
