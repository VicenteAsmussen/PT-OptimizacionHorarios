import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crearEntorno } from "./verificar-local.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const puerto = 55432;
export function validarOpciones(argumentos) {
  if (!argumentos.includes("--autorizar-entorno-efimero")) throw new Error("Debe autorizar el entorno con --autorizar-entorno-efimero. Consulte docs/escenario-demostracion.md.");
  const opciones = {};
  for (let indice = 0; indice < argumentos.length; indice++) {
    if (argumentos[indice] === "--autorizar-entorno-efimero") continue;
    if (argumentos[indice] === "--bin-postgres" && argumentos[indice + 1]) opciones.bin = argumentos[++indice];
    else throw new Error("Opción desconocida o incompleta.");
  }
  return opciones;
}
export function validarDestino(destino) {
  let url;
  try { url = new URL(destino); } catch { throw new Error("Destino de demostración inválido."); }
  if (url.protocol !== "postgres:" || url.hostname !== "127.0.0.1" || url.port !== String(puerto)
    || url.pathname !== "/demo_tesis_fase2" || url.username !== "demo_tesis" || !url.password || url.search || url.hash) {
    throw new Error("Destino de demostración no autorizado.");
  }
  return { database: url.pathname.slice(1) };
}
export function crearEntornoDemostracion(temporal, origen = process.env) {
  return crearEntorno(temporal, origen);
}
async function comprobarPuertoLibre() {
  const servidor = createServer();
  await new Promise((aceptar, rechazar) => {
    servidor.once("error", () => rechazar(new Error("El puerto 55432 no está disponible. No se conectó a su ocupante.")));
    servidor.listen({ host: "127.0.0.1", port: puerto, exclusive: true }, aceptar);
  });
  await new Promise((aceptar, rechazar) => servidor.close(error => error ? rechazar(error) : aceptar()));
}
export async function ejecutarDemostracion(argumentos) {
  const opciones = validarOpciones(argumentos);
  const bin = opciones.bin ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "/usr/lib/postgresql/18/bin");
  const exe = nombre => join(bin, nombre + (process.platform === "win32" ? ".exe" : ""));
  for (const archivo of [exe("initdb"), exe("pg_ctl"), exe("createdb"), join(raiz, "backend/node_modules/vitest/vitest.mjs")]) {
    if (!existsSync(archivo)) throw new Error("Falta PostgreSQL 18 o Vitest instalado. No se instalarán herramientas.");
  }
  await comprobarPuertoLibre();
  const baseTemporal = realpathSync(process.platform === "win32" && existsSync(join(tmpdir(), "opencode")) ? join(tmpdir(), "opencode") : tmpdir());
  const ubicacion = relative(realpathSync(raiz), baseTemporal);
  if (!ubicacion || (!ubicacion.startsWith("..") && !isAbsolute(ubicacion))) throw new Error("Los temporales deben quedar fuera del repositorio.");
  const temporal = mkdtempSync(join(baseTemporal, "tesis-fase2-"));
  const datos = join(temporal, "datos");
  const archivoClave = join(temporal, "clave-initdb");
  const clave = randomBytes(24).toString("hex");
  const destino = `postgres://demo_tesis:${clave}@127.0.0.1:${puerto}/demo_tesis_fase2`;
  validarDestino(destino);
  const entorno = { ...crearEntornoDemostracion(temporal), PGPASSWORD: clave, PGCONNECT_TIMEOUT: "5" };
  const ejecutar = (programa, tokens, heredar = false) => {
    // En Windows, el servidor hijo puede conservar los pipes de pg_ctl después de su salida.
    const salida = programa === exe("pg_ctl") ? "ignore" : heredar ? "inherit" : "pipe";
    const resultado = spawnSync(programa, tokens, { cwd: join(raiz, "backend"), env: entorno, shell: false,
      encoding: "utf8", stdio: salida, timeout: 180000 });
    if (resultado.error || resultado.status !== 0) {
      const detalle = String(resultado.stderr ?? "").replaceAll(clave, "[oculta]").split(/\r?\n/).slice(-5).join("\n");
      throw new Error(`Falló ${programa === process.execPath ? "la comprobación" : programa.split(/[\\/]/).at(-1)} (${resultado.error?.code ?? `salida ${resultado.status ?? "interrumpida"}`}). ${detalle}`);
    }
  };
  let fallo;
  let detenido = true;
  try {
    writeFileSync(archivoClave, clave + "\n", { mode: 0o600, flag: "wx" });
    ejecutar(exe("initdb"), ["-D", datos, "-U", "demo_tesis", "--pwfile", archivoClave, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
    rmSync(archivoClave);
    // El archivo evita que Windows interprete las comillas como parte del directorio.
    appendFileSync(join(datos, "postgresql.conf"), `\nlisten_addresses = '127.0.0.1'\nport = ${puerto}\nunix_socket_directories = ''\nmax_connections = 10\n`);
    // pg_ctl controla exclusivamente este data dir nuevo. No se registra un servicio.
    detenido = false;
    ejecutar(exe("pg_ctl"), ["start", "-D", datos, "-l", join(temporal, "postgres.log"), "-w", "-t", "30"]);
    ejecutar(exe("createdb"), ["-h", "127.0.0.1", "-p", String(puerto), "-U", "demo_tesis", "--no-password", "demo_tesis_fase2"]);
    // Esta capacidad nunca procede de DATABASE_URL ni de archivos .env heredados.
    entorno.DEMOSTRACION_URL = destino;
    entorno.DEMOSTRACION_DATOS = realpathSync(datos);
    entorno.DEMOSTRACION_AUTORIZADA = "cluster-propio-sintetico";
    console.log("PostgreSQL efímero propio: 127.0.0.1:55432/demo_tesis_fase2. Julia sustituida exclusivamente en pruebas.");
    ejecutar(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.demostracion.config.ts", "--configLoader", "runner"], true);
  } catch (error) {
    fallo = error;
    const registro = join(temporal, "postgres.log");
    if (existsSync(registro)) console.error(readFileSync(registro, "utf8").split(/\r?\n/).slice(-8).join("\n"));
  } finally {
    if (!detenido) {
      // También tras un inicio incompleto, el PID solo puede proceder de nuestro cluster.
      if (existsSync(join(datos, "postmaster.pid"))) {
        try { ejecutar(exe("pg_ctl"), ["stop", "-D", datos, "-m", "fast", "-w", "-t", "30"]); detenido = true; }
        catch { fallo = new Error(`No se confirmó la detención del cluster propio. Se preservó ${temporal}.`); }
      } else detenido = true;
    }
    if (detenido) {
      rmSync(temporal, { recursive: true, force: true });
      console.log("Cluster propio detenido y temporales retirados.");
    }
  }
  if (fallo) throw fallo;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ejecutarDemostracion(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
