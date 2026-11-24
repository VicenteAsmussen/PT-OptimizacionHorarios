import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { esquemaSalida, LIMITE_SOLVER_SEGUNDOS, type EntradaOptimizacion, type SalidaOptimizacion } from "./contrato.js";
import { validarSalidaOptimizacion } from "./salida.js";
import { leerProgresoSolver, leerRegistroHiGHS, type DiagnosticoProcesoJulia, type ProgresoSolverJulia, type RegistroHiGHS } from "./diagnostico.js";
export type { DiagnosticoProcesoJulia } from "./diagnostico.js";

export interface OpcionesProcesoJulia {
  signal?: AbortSignal;
  arranqueMs?: number;
  extraccionMs?: number;
  margenSolverMs?: number;
  maxEntradaBytes?: number;
  maxSalidaBytes?: number;
  alDiagnostico?: (diagnostico: DiagnosticoProcesoJulia) => void;
}
const activos = new Map<ChildProcessWithoutNullStreams, () => void>();
/** Invocar durante el cierre ordenado del servidor. Importar no registra manejadores globales de eventos. */
// Cancela los procesos de cálculo registrados sin incorporar resultados parciales.
export function cerrarProcesosJulia(): void { for (const cancelar of [...activos.values()]) cancelar(); }

// Intercambia JSON con Julia y exige límites de proceso y una salida conforme al contrato.
export async function ejecutarJulia(entrada: EntradaOptimizacion, opciones: OpcionesProcesoJulia = {}): Promise<SalidaOptimizacion> {
  const { signal, alDiagnostico, ...configuracion } = opciones;
  if (signal?.aborted) throw new Error("Julia interrumpido antes del arranque.");
  const limites = { arranqueMs: 120_000, extraccionMs: 60_000, margenSolverMs: 30_000,
    maxEntradaBytes: 8 * 1024 * 1024, maxSalidaBytes: 8 * 1024 * 1024, ...configuracion };
  if (Object.values(limites).some(v => !Number.isSafeInteger(v) || v <= 0) ||
    !Number.isFinite(entrada.parametros.limiteSolverSegundos) || entrada.parametros.limiteSolverSegundos <= 0 || entrada.parametros.limiteSolverSegundos > LIMITE_SOLVER_SEGUNDOS) {
    throw new Error("Entrada o límites del proceso Julia inválidos.");
  }
  const contenido = JSON.stringify(entrada);
  if (Buffer.byteLength(contenido) > limites.maxEntradaBytes) throw new Error("Entrada Julia supera el límite permitido.");
  const proyecto = fileURLToPath(new URL("../../optimizacion/julia/", import.meta.url));
  const script = fileURLToPath(new URL("../../optimizacion/julia/ejecutar.jl", import.meta.url));
  return new Promise((resolver, rechazar) => {
    const inicio = performance.now();
    let inicioJulia: number | undefined, construccion: number | undefined;
    let inicioSolver: number | undefined, inicioExtraccion: number | undefined;
    let inicioTransferencia: number | undefined, inicioResolucion: number | undefined;
    let progresoNoDisponible = false;
    const muestrasProgreso: ProgresoSolverJulia[] = [];
    let registroHiGHS: RegistroHiGHS | undefined;
    let finIntento: number | undefined;
    let cierreProceso: DiagnosticoProcesoJulia["cierreProceso"];
    // Emite tiempos y métricas acotadas sin conceder al observador autoridad sobre el cálculo.
    const notificar = (origenFin: DiagnosticoProcesoJulia["origenFin"]) => {
      const fin = finIntento ?? performance.now();
      // Expresa la duración de cada fase en milisegundos no negativos para el diagnóstico.
      const diferencia = (a: number, b: number) => Math.max(0, Math.round((b - a) * 1000) / 1000);
      const diagnostico: DiagnosticoProcesoJulia = { origenFin, fase: fase === "extracción" ? "extraccion" : fase,
        ...(fase !== "solver" || inicioTransferencia === undefined ? {} : {
          subfaseSolver: inicioResolucion === undefined ? "transferencia" as const : "resolucion" as const }),
        tiemposMs: { total: diferencia(inicio, fin), arranque: diferencia(inicio, inicioSolver ?? fin),
          ...(inicioJulia === undefined ? {} : { inicioJulia: diferencia(inicio, inicioJulia),
            carga: diferencia(inicioJulia, construccion ?? inicioSolver ?? fin) }),
          ...(construccion === undefined ? {} : { construccion: diferencia(construccion, inicioSolver ?? fin) }),
          ...(inicioSolver === undefined ? {} : { llamadaSolver: diferencia(inicioSolver, inicioExtraccion ?? fin) }),
          ...(inicioTransferencia === undefined ? {} : { transferencia: diferencia(inicioTransferencia, inicioResolucion ?? inicioExtraccion ?? fin) }),
          ...(inicioResolucion === undefined ? {} : { resolucion: diferencia(inicioResolucion, inicioExtraccion ?? fin) }),
          ...(inicioExtraccion === undefined ? {} : { extraccion: diferencia(inicioExtraccion, fin) }) },
        muestrasProgreso: muestrasProgreso.map(muestra => ({ ...muestra })), progresoNoDisponible,
        ...(cierreProceso ? { cierreProceso } : {}),
        ...(registroHiGHS === undefined ? {} : { registroHiGHS: { ...registroHiGHS, hitos: registroHiGHS.hitos.map(hito => ({ ...hito })) } }) };
      // Un observador no tiene autoridad para cambiar el resultado ni detener Julia.
      try { alDiagnostico?.(diagnostico); } catch { /* El cálculo conserva su desenlace. */ }
    };
    let fase: "arranque" | "solver" | "extracción" = "arranque";
    let hijo: ChildProcessWithoutNullStreams;
    try {
      hijo = spawn("julia", ["--startup-file=no", `--project=${proyecto}`, script],
        { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch { notificar("error"); rechazar(new Error("Julia no pudo iniciarse.")); return; }
    let terminado = false;
    let salidaObservada = false, noIniciado = false;
    const observarSalida = () => { salidaObservada = true; };
    hijo.once("exit", observarSalida);
    let temporizador: ReturnType<typeof setTimeout>;
    let bytesSalida = 0, bytesError = 0, pendienteError = "";
    const fragmentos: Buffer[] = [];
    // Interrumpe el cálculo cuando deja de tener vigencia para incorporar horarios.
    const cancelar = () => fallar("Julia interrumpido por pérdida de vigencia del proceso.", "interrupcion");
    // Libera el seguimiento temporal del proceso que ya tiene un desenlace.
    const limpiar = () => { clearTimeout(temporizador); activos.delete(hijo); signal?.removeEventListener("abort", cancelar); hijo.removeListener("exit", observarSalida); };
    // Cierra los canales y el proceso ante un fallo sin admitir una salida posterior.
    const fallar = (mensaje: string, origen: DiagnosticoProcesoJulia["origenFin"] = "error") => {
      if (terminado) return;
      terminado = true; finIntento = performance.now(); limpiar();
      const externo = origen === "watchdog" || origen === "interrupcion";
      const inicioEspera = performance.now();
      // La señal no acredita salida. La espera adicional no amplía el plazo del cálculo.
      const confirmacion = externo ? new Promise<"confirmada" | "no_confirmada" | "no_iniciado">(resolverCierre => {
        if (salidaObservada || noIniciado) { resolverCierre(noIniciado ? "no_iniciado" : "confirmada"); return; }
        let espera: ReturnType<typeof setTimeout>;
        const completar = (estado: "confirmada" | "no_confirmada" | "no_iniciado") => {
          clearTimeout(espera);
          hijo.removeListener("exit", confirmar); hijo.removeListener("close", confirmar);
          resolverCierre(estado);
        };
        const confirmar = () => completar(noIniciado ? "no_iniciado" : "confirmada");
        hijo.once("exit", confirmar); hijo.once("close", confirmar);
        espera = setTimeout(() => completar("no_confirmada"), 2000);
      }) : undefined;
      // Mantener los manejadores de error hasta el cierre evita errores de los flujos sin atender.
      hijo.stdin.destroy(); hijo.stdout.destroy(); hijo.stderr.destroy();
      let senalEnviada = false;
      try { senalEnviada = hijo.kill("SIGKILL"); } catch { /* La confirmación sigue dependiendo de la salida observada. */ }
      const finalizar = () => { notificar(origen); rechazar(new Error(mensaje)); };
      if (confirmacion) void confirmacion.then(estado => {
        cierreProceso = { estado, esperaMs: Math.max(0, Math.round((performance.now() - inicioEspera) * 1000) / 1000), senalEnviada };
        if (estado === "no_confirmada") console.error("No se confirmó la salida del proceso Julia tras el corte externo.");
        finalizar();
      });
      else finalizar();
    };
    // Sustituye el límite de espera al cambiar de fase del cálculo.
    const vigilar = (milisegundos: number) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => fallar(`Julia excedió el tiempo de ${fase}.`, "watchdog"), milisegundos);
    };
    activos.set(hijo, () => fallar("Julia interrumpido por apagado del servidor.", "interrupcion"));
    signal?.addEventListener("abort", cancelar, { once: true });
    vigilar(limites.arranqueMs);
    hijo.on("error", () => { if (!hijo.pid) noIniciado = true; fallar("Julia no pudo ejecutarse."); });
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
        if (linea === "OPTIMIZACION:CARGA" && fase === "arranque" && inicioJulia === undefined && construccion === undefined) {
          inicioJulia = performance.now();
        } else if (linea === "OPTIMIZACION:CONSTRUCCION" && fase === "arranque" && construccion === undefined) {
          construccion = performance.now();
        } else if (linea === "OPTIMIZACION:PROGRESO_NO_DISPONIBLE" && fase === "arranque") {
          progresoNoDisponible = true;
        } else if (linea === "OPTIMIZACION:SOLVER" && fase === "arranque") {
          inicioSolver = performance.now();
          fase = "solver"; vigilar(entrada.parametros.limiteSolverSegundos * 1000 + limites.margenSolverMs);
        } else if (linea === "OPTIMIZACION:TRANSFERENCIA" && fase === "solver" && inicioTransferencia === undefined && inicioResolucion === undefined) {
          inicioTransferencia = performance.now();
        } else if (linea === "OPTIMIZACION:RESOLUCION" && fase === "solver" && inicioTransferencia !== undefined && inicioResolucion === undefined) {
          inicioResolucion = performance.now();
        } else if (linea === "OPTIMIZACION:EXTRACCION" && fase === "solver") {
          inicioExtraccion = performance.now();
          fase = "extracción"; vigilar(limites.extraccionMs);
        } else if (fase === "solver") {
          const evento = leerRegistroHiGHS(linea);
          if (evento?.tipo === "configuracion" && registroHiGHS === undefined && inicioTransferencia !== undefined && inicioResolucion === undefined) {
            registroHiGHS = { configurado: true, limiteSolverSegundos: evento.limiteSolverSegundos, hitos: [] };
          } else if (evento?.tipo === "no_disponible" && registroHiGHS === undefined && inicioTransferencia !== undefined && inicioResolucion === undefined) {
            registroHiGHS = { configurado: false, hitos: [] };
          } else if (evento?.tipo === "hito" && registroHiGHS?.configurado && registroHiGHS.hitos.length < 7 &&
            !registroHiGHS.hitos.some(hito => hito.hito === evento.hito)) {
            registroHiGHS.hitos.push({ hito: evento.hito,
              tiempoDesdeSolverMs: Math.max(0, Math.round((performance.now() - inicioSolver!) * 1000) / 1000) });
          } else if (muestrasProgreso.length < 60) {
            const muestra = leerProgresoSolver(linea);
            if (muestra && muestra.tiempoSolverSegundos >= (muestrasProgreso.at(-1)?.tiempoSolverSegundos ?? 0)) {
              muestrasProgreso.push(muestra);
            }
          }
        }
      }
    });
    hijo.once("close", (codigo, senal) => {
      salidaObservada = true;
      if (terminado) return;
      if (codigo !== 0 || senal) { fallar("Julia terminó sin resultado válido."); return; }
      let salida: unknown;
      try { salida = JSON.parse(Buffer.concat(fragmentos).toString("utf8")); }
      catch { fallar("Salida Julia no contiene JSON válido."); return; }
      const lectura = esquemaSalida.safeParse(salida);
      if (!lectura.success || !validarSalidaOptimizacion(entrada, lectura.data).valida) {
        fallar("Salida Julia incumple el contrato de optimización."); return;
      }
      terminado = true; limpiar(); notificar("salida"); resolver(lectura.data);
    });
    hijo.stdin.end(contenido);
  });
}
