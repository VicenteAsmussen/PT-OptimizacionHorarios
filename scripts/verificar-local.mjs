import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("../", import.meta.url));

// Listas de archivos permitidos y revisados, cada incorporación exige revisar importaciones y efectos.
export const comprobaciones = {
  transporte: { directorio: "frontend", archivos: ["tests/api.test.mjs"] },
  frontend: { directorio: "frontend", archivos: [
    "src/components/iconos-archivo.test.mjs",
    "src/components/layout/AppLayout.test.mjs",
    "src/components/notificaciones/contenedor.test.mjs",
    "src/features/administracion-periodos/administracion-periodos.test.mjs",
    "src/features/administracion-periodos/creacion-periodos.test.mjs",
    "src/features/administracion-periodos/selector-periodo.test.mjs",
    "src/features/administracion-periodos/vista-periodo.test.mjs",
    "src/features/asignaturas/asignaturas.test.mjs",
    "src/features/asignaturas/notificaciones.test.mjs",
    "src/features/asignaturas/permisos-vista.test.mjs",
    "src/features/asignaturas/rediseno-tablas.test.mjs",
    "src/features/asignaturas/secciones.test.mjs",
    "src/features/dashboard/DashboardPage.test.mjs",
    "src/features/disponibilidad/arrastre.test.mjs",
    "src/features/disponibilidad/bloqueo-optimizacion.test.mjs",
    "src/features/disponibilidad/disponibilidad.test.mjs",
    "src/features/horarios-externos/diseno.test.mjs",
    "src/features/horarios-externos/horarios-externos.test.mjs",
    "src/features/horarios-externos/notificaciones.test.mjs",
    "src/features/horarios-externos/permisos.test.mjs",
    "src/features/horarios-externos/resumen-departamentos.test.mjs",
    "src/features/mi-horario/mi-horario.test.mjs",
    "src/features/mi-horario/sesiones.test.mjs",
    "src/features/optimizacion/iconos.test.mjs",
    "src/features/optimizacion/interfaz.test.mjs",
    "src/features/optimizacion/optimizacion.test.mjs",
    "src/features/profesores/limites.test.mjs",
    "src/features/profesores/notificaciones.test.mjs",
    "src/features/profesores/profesores.test.mjs",
    "src/features/resultados-horarios/calendario/presentacion.test.mjs",
    "src/features/resultados-horarios/navigation-regression.test.mjs",
    "src/features/resultados-horarios/resultados-horarios.test.mjs",
    "src/features/resultados-horarios/superficies-resultados.test.mjs",
    "src/features/seguimiento-disponibilidad/seguimiento.test.mjs",
    "src/hooks/useDesbordamientoTabla.test.mjs",
    "src/lib/api.test.mjs",
    "src/lib/focoTabla.test.mjs",
    "src/lib/notificaciones.test.mjs",
    "src/lib/periodos.test.mjs",
    "src/styles/paginas.test.mjs",
  ] },
  backend: { directorio: "backend", archivos: [
    "tests/configuracion-entorno.test.ts",
    "tests/limites-profesores.test.ts",
    "tests/rut.test.ts",
    "tests/seguridad-conexion-pruebas.test.ts",
    "tests/excel/excel-salas-utils.test.ts",
    "tests/excel/horarios-excel-alcance.test.ts",
    "tests/excel/horarios-excel-externos-import.test.ts",
    "tests/excel/horarios-excel-externos-sincronizacion.test.ts",
    "tests/excel/horarios-excel-export.test.ts",
    "tests/excel/horarios-excel-import.test.ts",
    "tests/excel/horarios-externos-cobertura.test.ts",
    "tests/optimizacion/optimizacion-ejecuciones.test.ts",
    "tests/optimizacion/optimizacion-http.test.ts",
    "tests/optimizacion/optimizacion-matematica.test.ts",
    "tests/optimizacion/optimizacion-proceso.test.ts",
  ] },
  "tipos-frontend": { directorio: "frontend", archivos: [] },
  "tipos-backend": { directorio: "backend", archivos: [] },
};

// Restringe la verificación a grupos cuyo inventario y efectos se revisaron explícitamente.
export function seleccionarComprobacion(nombre) {
  if (!Object.hasOwn(comprobaciones, nombre)) throw new Error("Comprobación desconocida. Usa --listar.");
  return comprobaciones[nombre];
}

// Aísla el proceso hijo de credenciales heredadas y dirige sus archivos al temporal externo.
export function crearEntorno(temporal, origen = process.env) {
  const entorno = {};
  for (const clave of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "NUMBER_OF_PROCESSORS"]) {
    if (origen[clave] !== undefined) entorno[clave] = origen[clave];
  }
  return { ...entorno, NODE_ENV: "test", RUN_ISOLATED_DATABASE_TESTS: "false",
    PRUEBAS_EN_EJECUCION: "yes", VERIFICACION_TEMPORAL: temporal,
    TMP: temporal, TEMP: temporal, TMPDIR: temporal, HOME: temporal, USERPROFILE: temporal,
    APPDATA: temporal, LOCALAPPDATA: temporal, XDG_CACHE_HOME: temporal };
}

// Ejecuta el grupo local con herramientas existentes y retira sus temporales al terminar.
function ejecutar(nombre) {
  const comprobacion = seleccionarComprobacion(nombre);
  const directorio = join(raiz, comprobacion.directorio);
  const esTipos = nombre.startsWith("tipos-");
  const ejecutable = esTipos ? "node_modules/typescript/bin/tsc"
    : nombre === "backend" ? "node_modules/vitest/vitest.mjs" : undefined;
  for (const archivo of [...comprobacion.archivos, ...(ejecutable ? [ejecutable] : [])]) {
    if (!existsSync(join(directorio, archivo))) throw new Error(`Falta ${comprobacion.directorio}/${archivo}. No se instalarán herramientas.`);
  }
  const baseTemporal = realpathSync(process.platform === "win32" && existsSync(join(tmpdir(), "opencode"))
    ? join(tmpdir(), "opencode") : tmpdir());
  const ubicacion = relative(realpathSync(raiz), baseTemporal);
  if (!ubicacion || (!ubicacion.startsWith("..") && !isAbsolute(ubicacion))) {
    throw new Error("El directorio temporal debe estar fuera del repositorio.");
  }
  const temporal = mkdtempSync(join(baseTemporal, "verificacion-local-"));
  try {
    const argumentos = esTipos ? [ejecutable, "--noEmit", "--incremental", "false"]
      : nombre === "backend" ? [ejecutable, "run", "--config", "vitest.local.config.ts", "--configLoader", "runner"]
      : ["--experimental-transform-types", "--test", "--test-concurrency=1", ...comprobacion.archivos];
    const resultado = spawnSync(process.execPath, argumentos, {
      cwd: directorio, env: crearEntorno(temporal), stdio: "inherit", shell: false,
    });
    if (resultado.error) throw new Error(`No se pudo iniciar ${nombre}: ${resultado.error.code}`);
    if (resultado.signal) throw new Error(`Comprobación interrumpida: ${nombre}`);
    return resultado.status ?? 1;
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Uso: node scripts/verificar-local.mjs <comprobación|--listar>");
    if (process.argv[2] === "--listar") {
      for (const [nombre, comprobacion] of Object.entries(comprobaciones)) {
        console.log(`${nombre}: ${comprobacion.archivos.length ? `${comprobacion.archivos.length} archivos explícitos` : "TypeScript sin emisión"}`);
        for (const archivo of comprobacion.archivos) console.log(`  ${comprobacion.directorio}/${archivo}`);
      }
    } else process.exitCode = ejecutar(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
