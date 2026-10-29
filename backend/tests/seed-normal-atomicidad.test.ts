import { expect, it } from "vitest";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

// Explicit opt-in; never use the application database for this mutation probe.
const habilitado = process.env.SEED_NORMAL_PROBE_DISPOSABLE === "yes";

it.skipIf(!habilitado)("reconciles atomically without changing protected rows", async () => {
  const conexion = process.env.SEED_NORMAL_PROBE_URL;
  const nombreEsperado = process.env.SEED_NORMAL_PROBE_DATABASE;
  if (!conexion || !nombreEsperado || !/^verificacion_seed_[a-zA-Z0-9_]+$/.test(nombreEsperado)) {
    throw new Error("Explicit owned disposable database required");
  }
  const destino = new URL(conexion);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(destino.hostname) || destino.pathname !== `/${nombreEsperado}`) {
    throw new Error("Disposable database destination rejected");
  }
  const cliente = postgres(conexion, { max: 1, onnotice: () => {} });
  const ejecutar = (argumentos: string[] = [], entorno = "development") => spawnSync(process.execPath, [
    "node_modules/tsx/dist/cli.mjs", "src/db/seed.ts", ...argumentos,
  ], {
    encoding: "utf8", timeout: 60000,
    env: { ...process.env, DATABASE_URL: conexion, NODE_ENV: entorno, DOTENV_CONFIG_QUIET: "true" },
  });
  const capturar = async () => {
    const datos: Record<string, string> = {};
    for (const { tablename } of await cliente`select tablename from pg_tables where schemaname='public' order by tablename`) {
      const filas = await cliente`select to_jsonb(t) fila from ${cliente(tablename)} t`;
      datos[tablename] = createHash("sha256").update(JSON.stringify(filas.map(fila => JSON.stringify(fila.fila)).sort())).digest("hex");
    }
    return datos;
  };
  let disparadorCreado = false;
  let funcionCreada = false;
  try {
    const [identidad] = await cliente`select current_database() nombre`;
    if (identidad.nombre !== nombreEsperado) throw new Error("Disposable database identity mismatch");
    expect(ejecutar().status).toBe(0);
    const [tipo] = await cliente`select id from tipos_hora where tipo='Teórica'`;
    await cliente`update asignaturas set semestre_malla=10, es_critica=true where codigo='612239'`;
    await cliente`update asignatura_tipo_hora set horas=4 where asignatura_codigo='340277' and tipo_hora_id=${tipo.id}`;
    const anterior = await capturar();
    const identidades = await cliente`select id,usuario_id,rut from profesores order by id`;
    const criticidad = await cliente`select codigo,es_critica from asignaturas order by codigo`;
    const resultado = ejecutar();
    expect(resultado.status).toBe(0);
    const posterior = await capturar();
    for (const tabla of ["usuarios", "secretarias", "ofertas_asignaturas", "oferta_tipo_hora", "disponibilidad_profesores", "horarios_asignaturas", "planificaciones_semestres"]) {
      expect(posterior[tabla]).toBe(anterior[tabla]);
    }
    expect(await cliente`select id,usuario_id,rut from profesores order by id`).toEqual(identidades);
    expect(await cliente`select codigo,es_critica from asignaturas order by codigo`).toEqual(criticidad);
    expect((await cliente`select horas from asignatura_tipo_hora where asignatura_codigo='340277' and tipo_hora_id=${tipo.id}`)[0].horas).toBe(2);
    expect((await cliente`select h.horas from asignatura_tipo_hora h join tipos_hora t on t.id=h.tipo_hora_id where h.asignatura_codigo='620434' and t.tipo='Práctica'`)[0].horas).toBe(2);
    expect(await cliente`select a.codigo,a.semestre_malla,d.nombre from asignaturas a join departamentos d on d.id=a.departamento_id where a.codigo in ('610229','612239') order by a.codigo`).toEqual([
      { codigo: "610229", semestre_malla: 7, nombre: "Departamento de Administración y Auditoría" },
      { codigo: "612239", semestre_malla: 7, nombre: "Departamento de Administración y Auditoría" },
    ]);
    expect(await cliente`select asignatura_codigo from asignatura_tipo_hora where asignatura_codigo in ('620449','620456','620477')`).toHaveLength(0);
    const repetido = ejecutar();
    expect(repetido.status).toBe(0);
    expect(repetido.stdout).toBe(resultado.stdout);
    expect(await capturar()).toEqual(posterior);
    for (const [argumentos, entorno] of [[["--invalid"], "development"], [["--reemplazar-academico"], "production"]] as const) {
      const huella = await capturar();
      expect(ejecutar([...argumentos], entorno).status).toBe(1);
      expect(await capturar()).toEqual(huella);
    }
    await cliente`update asignaturas set semestre_malla=10 where codigo='612239'`;
    await cliente.unsafe("create function verify_normal_seed_failure() returns trigger language plpgsql as $$ begin raise exception 'Forced normal seed late failure'; end $$");
    funcionCreada = true;
    await cliente.unsafe("create trigger verify_normal_seed_failure before update on profesores for each row execute function verify_normal_seed_failure()");
    disparadorCreado = true;
    const huella = await capturar();
    const fallo = ejecutar();
    expect(fallo.status).toBe(1);
    expect(fallo.stdout).toContain("✓ Asegurados 48 usuarios base");
    expect(fallo.stderr).toContain("Forced normal seed late failure");
    expect(await capturar()).toEqual(huella);
  } finally {
    if (disparadorCreado) await cliente.unsafe("drop trigger verify_normal_seed_failure on profesores");
    if (funcionCreada) await cliente.unsafe("drop function verify_normal_seed_failure()");
    await cliente.end();
  }
}, 180000);
