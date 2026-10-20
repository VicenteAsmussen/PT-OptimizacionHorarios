import { expect, it } from "vitest";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

// Opt in only for a migrated, disposable PostgreSQL container on an ephemeral port.
const habilitado = process.env.SEED_PROBE_DISPOSABLE === "yes" && !!process.env.SEED_PROBE_URL;
it.skipIf(!habilitado)("preserves protected rows and rolls back a failed academic replacement", async () => {
  const conexion = process.env.SEED_PROBE_URL!;
  const destino = new URL(conexion);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(destino.hostname);
  expect(destino.pathname).toBe("/horarios_db");
  expect(destino.port).not.toBe("");
  expect(["5432", "5433"]).not.toContain(destino.port);
  const cliente = postgres(conexion, { max: 1 });
  const ejecutar = (reemplazar = false, entorno = "development") => spawnSync(process.execPath, [
    "node_modules/tsx/dist/cli.mjs", "src/db/seed.ts", ...(reemplazar ? ["--reemplazar-academico"] : []),
  ], { encoding: "utf8", timeout: 45000, env: { ...process.env, NODE_ENV: entorno, DATABASE_URL: conexion } });
  const capturar = async () => {
    const tablas = await cliente`select tablename from pg_tables where schemaname='public' order by tablename`;
    const datos: Record<string, unknown[]> = {};
    for (const { tablename } of tablas) {
      datos[tablename] = (await cliente`select to_jsonb(t) as fila from ${cliente(tablename)} t`)
        .map(fila => JSON.stringify(fila.fila)).sort();
    }
    return createHash("sha256").update(JSON.stringify(datos)).digest("hex");
  };
  const protegidos = () => cliente`select jsonb_build_object(
    'usuarios', (select jsonb_agg(to_jsonb(u) order by id) from usuarios u where rol <> 'profesor'),
    'secretarias', (select jsonb_agg(to_jsonb(s) order by id) from secretarias s),
    'salas', (select jsonb_agg(to_jsonb(s) order by id) from salas s),
    'bloques', (select jsonb_agg(to_jsonb(b) order by id) from bloques_horarios b),
    'carreras', (select jsonb_agg(to_jsonb(c) order by id) from carreras c),
    'planes', (select jsonb_agg(to_jsonb(p) order by id) from planificaciones_semestres p)) as datos`;
  try {
    expect(ejecutar().status).toBe(0);
    const anterior = await protegidos();
    expect(ejecutar(true).status).toBe(0);
    expect(await protegidos()).toEqual(anterior);
    expect(Number((await cliente`select count(*) from asignaturas`)[0].count)).toBe(15);
    const profesores = await cliente`select p.tipo, u.correo, u.clave from profesores p join usuarios u on u.id=p.usuario_id`;
    expect(profesores).toHaveLength(22);
    for (const profesor of profesores) {
      expect(profesor.tipo).toBe("planta");
      expect(profesor.correo).toMatch(/^[a-z]+@ubb\.cl$/);
      expect(await bcrypt.compare("123456", profesor.clave)).toBe(true);
    }
    let huella = await capturar();
    expect(ejecutar().status).toBe(0);
    expect(await capturar()).toBe(huella);
    expect(ejecutar(true, "production").status).toBe(1);
    expect(await capturar()).toBe(huella);
    await cliente.unsafe("create function fallar_seed() returns trigger language plpgsql as $$ begin raise exception 'forced seed failure'; end $$");
    await cliente.unsafe("create trigger fallar_seed before insert on asignaturas for each row execute function fallar_seed()");
    try {
      huella = await capturar();
      const fallo = ejecutar(true);
      expect(fallo.status).toBe(1);
      expect(fallo.stderr).toContain("forced seed failure");
      expect(await capturar()).toBe(huella);
    } finally {
      await cliente.unsafe("drop trigger fallar_seed on asignaturas");
      await cliente.unsafe("drop function fallar_seed()");
    }
  } finally {
    await cliente.end();
  }
}, 120000);
