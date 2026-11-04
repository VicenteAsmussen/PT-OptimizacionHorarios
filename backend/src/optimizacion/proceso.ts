import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { esquemaSalida, type EntradaOptimizacion, type SalidaOptimizacion } from "./contrato.js";
import { validarSalidaOptimizacion } from "./salida.js";

export interface OpcionesProcesoJulia {
  signal?: AbortSignal;
  arranqueMs?: number;
  extraccionMs?: number;
  margenSolverMs?: number;
  maxEntradaBytes?: number;
  maxSalidaBytes?: number;
}
const activos = new Map<ChildProcessWithoutNullStreams, () => void>();
/** Invocar desde el cierre ordenado del servidor. No se agregan listeners globales al importar. */
export function cerrarProcesosJulia(): void { for (const cancelar of [...activos.values()]) cancelar(); }

export async function ejecutarJulia(entrada: EntradaOptimizacion, opciones: OpcionesProcesoJulia = {}): Promise<SalidaOptimizacion> {
  const { signal, ...configuracion } = opciones;
  if (signal?.aborted) throw new Error("Julia interrumpido antes del arranque.");
  const limites = { arranqueMs: 120_000, extraccionMs: 60_000, margenSolverMs: 30_000,
    maxEntradaBytes: 8 * 1024 * 1024, maxSalidaBytes: 8 * 1024 * 1024, ...configuracion };
  if (Object.values(limites).some(v => !Number.isSafeInteger(v) || v <= 0) ||
    !Number.isFinite(entrada.parametros.limiteSolverSegundos) || entrada.parametros.limiteSolverSegundos <= 0 || entrada.parametros.limiteSolverSegundos > 300) {
    throw new Error("Entrada o límites del proceso Julia inválidos.");
  }
  const contenido = JSON.stringify(entrada);
  if (Buffer.byteLength(contenido) > limites.maxEntradaBytes) throw new Error("Entrada Julia supera el límite permitido.");
  const proyecto = fileURLToPath(new URL("../../optimizacion/julia/", import.meta.url));
  const script = fileURLToPath(new URL("../../optimizacion/julia/ejecutar.jl", import.meta.url));
  return new Promise((resolver, rechazar) => {
    let hijo: ChildProcessWithoutNullStreams;
    try {
      hijo = spawn("julia", ["--startup-file=no", `--project=${proyecto}`, script],
        { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch { rechazar(new Error("Julia no pudo iniciarse.")); return; }
    let terminado = false;
    let fase: "arranque" | "solver" | "extracción" = "arranque";
    let temporizador: ReturnType<typeof setTimeout>;
    let bytesSalida = 0, bytesError = 0, pendienteError = "";
    const fragmentos: Buffer[] = [];
    const cancelar = () => fallar("Julia interrumpido por pérdida de vigencia del proceso.");
    const limpiar = () => { clearTimeout(temporizador); activos.delete(hijo); signal?.removeEventListener("abort", cancelar); };
    const fallar = (mensaje: string) => {
      if (terminado) return;
      terminado = true; limpiar();
      // Mantener los listeners de error hasta el cierre evita errores de stream no atendidos.
      hijo.stdin.destroy(); hijo.stdout.destroy(); hijo.stderr.destroy(); hijo.kill("SIGKILL");
      rechazar(new Error(mensaje));
    };
    const vigilar = (milisegundos: number) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => fallar(`Julia excedió el tiempo de ${fase}.`), milisegundos);
    };
    activos.set(hijo, () => fallar("Julia interrumpido por apagado del servidor."));
    signal?.addEventListener("abort", cancelar, { once: true });
    vigilar(limites.arranqueMs);
    hijo.on("error", () => fallar("Julia no pudo ejecutarse."));
    hijo.stdin.on("error", () => fallar("Julia rechazó la entrada."));
    hijo.stdout.on("error", () => fallar("Salida Julia interrumpida."));
    hijo.stderr.on("error", () => fallar("Julia interrumpió el canal de control."));
    hijo.stdout.on("data", (datos: Buffer) => {
      if (terminado) return;
      bytesSalida += datos.length;
      if (bytesSalida > limites.maxSalidaBytes) { fallar("Salida Julia supera el límite permitido."); return; }
      fragmentos.push(Buffer.from(datos));
    });
    hijo.stderr.on("data", (datos: Buffer) => {
      if (terminado) return;
      bytesError += datos.length;
      if (bytesError > 65_536) { fallar("Julia excedió el límite del canal de control."); return; }
      pendienteError += datos.toString("utf8");
      let salto: number;
      while ((salto = pendienteError.indexOf("\n")) !== -1) {
        const linea = pendienteError.slice(0, salto).replace(/\r$/, "");
        pendienteError = pendienteError.slice(salto + 1);
        if (linea === "OPTIMIZACION:SOLVER" && fase === "arranque") {
          fase = "solver"; vigilar(entrada.parametros.limiteSolverSegundos * 1000 + limites.margenSolverMs);
        } else if (linea === "OPTIMIZACION:EXTRACCION" && fase === "solver") {
          fase = "extracción"; vigilar(limites.extraccionMs);
        }
      }
    });
    hijo.on("close", (codigo, senal) => {
      if (terminado) return;
      if (codigo !== 0 || senal) { fallar("Julia terminó sin resultado válido."); return; }
      let salida: unknown;
      try { salida = JSON.parse(Buffer.concat(fragmentos).toString("utf8")); }
      catch { fallar("Salida Julia no contiene JSON válido."); return; }
      const lectura = esquemaSalida.safeParse(salida);
      if (!lectura.success || !validarSalidaOptimizacion(entrada, lectura.data).valida) {
        fallar("Salida Julia incumple el contrato de optimización."); return;
      }
      terminado = true; limpiar(); resolver(lectura.data);
    });
    hijo.stdin.end(contenido);
  });
}
