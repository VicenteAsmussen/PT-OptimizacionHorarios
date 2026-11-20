import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import request from "../soporte/solicitud-api.js";
import type { Express } from "express";
import { habilitarPruebasIntegracion, exigirBasePruebas } from "../soporte/base-pruebas.js";
import { hashPassword } from "../../src/utils/password.js";

// La aplicación y su configuración se cargan solo después de verificar el aislamiento.
const habilitado = habilitarPruebasIntegracion(process.env);
if (habilitado) {
  exigirBasePruebas(process.env);
  if (process.env.PRUEBAS_EN_EJECUCION !== "yes") throw new Error("Falta la guardia de ejecución de pruebas");
}

describe.skipIf(!habilitado)("JWT sin sesiones en PostgreSQL nuevo y descartable", () => {
  let cliente: ReturnType<typeof postgres>;
  let app: Express;
  let configuracion: typeof import("../../src/config/db.js");
  let repositorio: typeof import("../../src/repositories/usuarios.repository.js").usuariosRepository;
  let verificar: typeof import("../../src/utils/jwt.js").verifyToken;
  let claveHash: string;
  let cuentaPrevia: number;
  let tokenAnterior: string;
  const clave = "Clave-sintetica-solo-fixture-2026";
  const migraciones = fileURLToPath(new URL("../../src/db/migrations", import.meta.url));
  type Cuenta = { id: number; correo: string };
  type Acceso = { cookie: string; token: string };
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
    const anteriores = registro.entries.filter((entrada: { idx: number }) => entrada.idx <= 20);
    expect(anteriores).toHaveLength(21);
    const carpeta = await mkdtemp(join(tmpdir(), "jwt-migraciones-"));
    try {
      await mkdir(join(carpeta, "meta"));
      await writeFile(join(carpeta, "meta/_journal.json"), JSON.stringify({ ...registro, entries: anteriores }));
      for (const entrada of anteriores) await copyFile(join(migraciones, `${entrada.tag}.sql`), join(carpeta, `${entrada.tag}.sql`));
      await migrate(drizzle(cliente), { migrationsFolder: carpeta });
      claveHash = await hashPassword(clave);
      const [previa] = await cliente`insert into usuarios (nombre,correo,clave,rol,version_sesion)
        values ('Cuenta previa sintética','previa@example.test',${claveHash},'admin',3) returning *`;
      cuentaPrevia = previa.id;
      const sid = "a".repeat(64);
      await cliente`insert into sesiones (id,usuario_id,expira_en)
        values (${sid},${cuentaPrevia},now()+interval '8 hours')`;
      const jwt = (await import("jsonwebtoken")).default;
      tokenAnterior = jwt.sign({ id: cuentaPrevia, nombre: previa.nombre, correo: previa.correo,
        rol: previa.rol, sid }, process.env.JWT_SECRET!, { expiresIn: "8h" });
      const antes = huella(previa);
      await migrate(drizzle(cliente), { migrationsFolder: migraciones });
      expect((await cliente`select count(*)::int as cantidad from drizzle.__drizzle_migrations`)[0].cantidad).toBe(registro.entries.length);
      expect(huella((await cliente`select * from usuarios where id=${cuentaPrevia}`)[0])).toBe(antes);
      expect((await cliente`select to_regclass('public.sesiones') is null as retirada`)[0].retirada).toBe(true);
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
    configuracion = await import("../../src/config/db.js");
    ({ app } = await import("../../src/app.js"));
    ({ usuariosRepository: repositorio } = await import("../../src/repositories/usuarios.repository.js"));
    ({ verifyToken: verificar } = await import("../../src/utils/jwt.js"));
  }, 60000);

  afterAll(async () => {
    await Promise.all([configuracion?.queryClient.end({ timeout: 5 }), cliente?.end({ timeout: 5 })]);
  });
  async function crearCuenta(nombre: string): Promise<Cuenta> {
    const correo = `${nombre}@example.test`;
    const [cuenta] = await cliente`insert into usuarios (nombre,correo,clave,rol)
      values (${nombre},${correo},${claveHash},'admin') returning id,correo`;
    return cuenta as Cuenta;
  }
  async function login(cuenta: Cuenta): Promise<Acceso> {
    const respuesta = await request(app).post("/api/auth/login").send({ correo: cuenta.correo, clave });
    expect(respuesta.status).toBe(200);
    const cookie = (respuesta.headers["set-cookie"] as unknown as string[])
      .find(valor => valor.startsWith("auth_token="))!.split(";")[0]!;
    const token = decodeURIComponent(cookie.slice("auth_token=".length));
    expect(verificar(token)).not.toHaveProperty("sid");
    return { cookie, token };
  }
  const me = (acceso: Acceso, bearer = false) => request(app).get("/api/auth/me")
    .set(bearer ? "Authorization" : "Cookie", bearer ? `Bearer ${acceso.token}` : acceso.cookie);

  it("conserva cuenta y versión de 0020, elimina sesiones y exige iniciar sesión de nuevo", async () => {
    expect((await request(app).get("/api/auth/me").auth(tokenAnterior, { type: "bearer" })).status).toBe(401);
    const acceso = await login({ id: cuentaPrevia, correo: "previa@example.test" });
    expect(verificar(acceso.token).versionSesion).toBe(3);
    expect((await me(acceso)).status).toBe(200);
  });

  it("cerrar sesión borra cookie sin modificar cuenta y una copia del JWT sigue válida", async () => {
    const cuenta = await crearCuenta("logout");
    const a = await login(cuenta), b = await login(cuenta);
    const antes = huella(await cliente`select * from usuarios where id=${cuenta.id}`);
    const respuesta = await request(app).post("/api/auth/logout").set("Cookie", a.cookie);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "success", message: "Sesión cerrada correctamente" });
    expect(respuesta.headers["set-cookie"][0]).toContain("auth_token=;");
    expect(huella(await cliente`select * from usuarios where id=${cuenta.id}`)).toBe(antes);
    expect((await me(a)).status).toBe(200);
    expect((await me(a, true)).status).toBe(200);
    expect((await me(b)).status).toBe(200);
  });

  it.each(["rol", "correo", "clave"])("cambiar %s por repositorio invalida tokens sin revivirlos al restaurar", async campo => {
    const cuenta = await crearCuenta(`cambio-${campo}`);
    const acceso = await login(cuenta);
    const cambios = campo === "rol" ? { rol: "profesor" as const }
      : campo === "correo" ? { correo: "otro@example.test" } : { clave: "otro-hash" };
    await repositorio.update(cuenta.id, cambios);
    expect((await me(acceso)).status).toBe(401);
    await repositorio.update(cuenta.id, { rol: "admin", correo: cuenta.correo, clave: claveHash });
    expect((await me(acceso, true)).status).toBe(401);
    expect((await cliente`select version_sesion from usuarios where id=${cuenta.id}`)[0].version_sesion).toBe(2);
    expect((await me(await login(cuenta))).status).toBe(200);
  });

  it("otro administrador cambia rol por HTTP e invalida todos los tokens anteriores", async () => {
    const actor = await login(await crearCuenta("actor-rol"));
    const cuenta = await crearCuenta("cambio-http");
    const acceso = await login(cuenta);
    const respuesta = await request(app).put(`/api/usuarios/${cuenta.id}`).set("Cookie", actor.cookie).send({ rol: "profesor" });
    expect(respuesta.status).toBe(200);
    expect((await me(acceso)).status).toBe(401);
    expect((await me(actor)).status).toBe(200);
  });

  it("otro administrador elimina cuenta por HTTP y sus tokens dejan de permitir acceso", async () => {
    const actor = await login(await crearCuenta("actor-baja"));
    const cuenta = await crearCuenta("baja");
    const acceso = await login(cuenta);
    const respuesta = await request(app).delete(`/api/usuarios/${cuenta.id}`).set("Cookie", actor.cookie);
    expect(respuesta.status).toBe(204);
    expect(await cliente`select id from usuarios where id=${cuenta.id}`).toHaveLength(0);
    expect((await me(acceso)).status).toBe(401);
    expect((await me(actor)).status).toBe(200);
  });
});
