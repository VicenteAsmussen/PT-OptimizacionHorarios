import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cerrarProcesosJulia, construirEntradaOptimizacion, ejecutarJulia } from "../src/optimizacion/index.js";

const { crearProceso } = vi.hoisted(() => ({ crearProceso: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: crearProceso }));

function entrada() {
  return construirEntradaOptimizacion({ ofertas: [], bloques: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"].flatMap((dia, d) =>
    Array.from({ length: 16 }, (_, b) => ({ id: d * 16 + b + 1, dia, numeroBloque: b + 1 }))),
    disponibilidades: [], externos: [], recursos: [], reservas: [] });
}
function proceso() {
  const hijo = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    stdin: new Writable({ write(_datos, _codificacion, callback) { callback(); } }), kill: vi.fn(() => true) });
  crearProceso.mockReturnValue(hijo);
  return hijo;
}
const opciones = { arranqueMs: 100, extraccionMs: 200, margenSolverMs: 50, maxEntradaBytes: 100000, maxSalidaBytes: 100000 };
afterEach(() => { cerrarProcesosJulia(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("proceso Julia aislado", () => {
  it("usa spawn sin shell, proyecto fijo y JSON por stdin/stdout", async () => {
    const hijo = proceso(); const datos = entrada();
    const escribir = vi.spyOn(hijo.stdin, "end");
    const promesa = ejecutarJulia(datos, opciones);
    const resultado = { version: 1, revision: datos.revision, estado: "optimo", asignaciones: [], faltantes: [], protecciones: [], objetivo: 0 };
    hijo.stderr.write('OPTIMIZACION:SOLVER\nOPTIMIZACION:EXTRACCION\n');
    hijo.stdout.write(JSON.stringify(resultado)); hijo.emit("close", 0, null);
    await expect(promesa).resolves.toEqual(resultado);
    expect(crearProceso).toHaveBeenCalledOnce();
    const [ejecutable, argumentos, configuracion] = crearProceso.mock.calls[0]!;
    expect(ejecutable).toBe("julia");
    expect(argumentos[0]).toBe("--startup-file=no");
    expect(argumentos.some((a: string) => a.startsWith("--project="))).toBe(true);
    expect(configuracion).toMatchObject({ shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    expect(escribir).toHaveBeenCalledWith(JSON.stringify(datos));
  });

  it.each(["error", "codigo", "json", "identidad", "exceso", "stderr", "stdin", "senal"])("rechaza %s con error seguro y cierre del hijo", async caso => {
    const hijo = proceso(); const datos = entrada();
    const promesa = ejecutarJulia(datos, { ...opciones, maxSalidaBytes: 100 });
    const rechazo = expect(promesa).rejects.toThrow(/Julia|Salida/);
    hijo.stderr.write("dato privado nunca expuesto\n");
    if (caso === "error") hijo.emit("error", new Error("dato privado nunca expuesto"));
    if (caso === "codigo") hijo.emit("close", 1, null);
    if (caso === "json") { hijo.stdout.write("no JSON"); hijo.emit("close", 0, null); }
    if (caso === "identidad") { hijo.stdout.write('{"revision":"otra"}'); hijo.emit("close", 0, null); }
    if (caso === "exceso") hijo.stdout.write("x".repeat(101));
    if (caso === "stderr") hijo.stderr.write("x".repeat(65537));
    if (caso === "stdin") hijo.stdin.emit("error", new Error("dato privado nunca expuesto"));
    if (caso === "senal") hijo.emit("close", null, "SIGTERM");
    await rechazo;
    await promesa.catch(error => expect(error.message).not.toContain("dato privado"));
    expect(hijo.kill).toHaveBeenCalled();
  });

  it("distingue arranque, solver y extracción con relojes separados", async () => {
    vi.useFakeTimers();
    let hijo = proceso();
    let promesa = ejecutarJulia(entrada(), opciones);
    let rechazo = expect(promesa).rejects.toThrow("arranque");
    await vi.advanceTimersByTimeAsync(101); await rechazo;
    hijo = proceso(); promesa = ejecutarJulia(entrada(), opciones);
    rechazo = expect(promesa).rejects.toThrow("solver");
    hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    await vi.advanceTimersByTimeAsync(300_051); await rechazo;
    hijo = proceso(); promesa = ejecutarJulia(entrada(), opciones);
    rechazo = expect(promesa).rejects.toThrow("extracción");
    hijo.stderr.write("OPTIMIZACION:SOLVER\nOPTIMIZACION:EXTRACCION\n");
    await vi.advanceTimersByTimeAsync(201); await rechazo;
  });

  it("no deja mensajes repetidos extender el watchdog y atiende apagado", async () => {
    vi.useFakeTimers();
    let hijo = proceso(); let promesa = ejecutarJulia(entrada(), opciones);
    let rechazo = expect(promesa).rejects.toThrow("solver");
    hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    await vi.advanceTimersByTimeAsync(300_000);
    hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    await vi.advanceTimersByTimeAsync(51); await rechazo;
    hijo = proceso(); promesa = ejecutarJulia(entrada(), opciones);
    rechazo = expect(promesa).rejects.toThrow("interrumpido");
    cerrarProcesosJulia(); await rechazo;
    expect(hijo.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("rechaza entrada excesiva antes de crear proceso", async () => {
    await expect(ejecutarJulia(entrada(), { ...opciones, maxEntradaBytes: 1 })).rejects.toThrow("Entrada");
    expect(crearProceso).not.toHaveBeenCalled();
  });
});
