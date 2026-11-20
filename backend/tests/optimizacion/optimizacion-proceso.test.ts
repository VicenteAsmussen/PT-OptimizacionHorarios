import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cerrarProcesosJulia, construirEntradaOptimizacion, ejecutarJulia, type DiagnosticoProcesoJulia } from "../../src/optimizacion/index.js";

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
afterEach(() => { cerrarProcesosJulia(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

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

  it.each([300, 45.5, 600, 900, 1800])("conserva JSON y watchdog dinámico con límite explícito %s", async limiteSolverSegundos => {
    vi.useFakeTimers();
    const hijo = proceso(), datos = entrada();
    datos.parametros.limiteSolverSegundos = limiteSolverSegundos;
    const escribir = vi.spyOn(hijo.stdin, "end");
    const promesa = ejecutarJulia(datos);
    const rechazo = expect(promesa).rejects.toThrow("Julia excedió el tiempo de solver.");
    expect(escribir).toHaveBeenCalledWith(JSON.stringify(datos));
    hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    await vi.advanceTimersByTimeAsync(limiteSolverSegundos * 1000 + 29_999);
    expect(hijo.kill).not.toHaveBeenCalled();
    hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    await vi.advanceTimersByTimeAsync(1); await rechazo;
    expect(hijo.kill).toHaveBeenCalledOnce();
    expect(hijo.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it.each([1801, 0, -1, Infinity, NaN])("rechaza límite %s antes de spawn y sin mutar la entrada", async limiteSolverSegundos => {
    const datos = entrada(); datos.parametros.limiteSolverSegundos = limiteSolverSegundos;
    const antes = structuredClone(datos);
    await expect(ejecutarJulia(datos)).rejects.toThrow("Entrada o límites del proceso Julia inválidos.");
    expect(crearProceso).not.toHaveBeenCalled();
    expect(datos).toEqual(antes);
  });

  it("mantiene las ventanas predeterminadas 120/1830/60 segundos sin prolongarlas por hitos", async () => {
    vi.useFakeTimers();
    const hijo = proceso(), diagnostico = vi.fn();
    const promesa = ejecutarJulia(entrada(), { alDiagnostico: diagnostico });
    const rechazo = expect(promesa).rejects.toThrow("Julia excedió el tiempo de extracción.");
    await vi.advanceTimersByTimeAsync(119_999);
    expect(hijo.kill).not.toHaveBeenCalled();
    hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    await vi.advanceTimersByTimeAsync(1829_999);
    expect(hijo.kill).not.toHaveBeenCalled();
    hijo.stderr.write("OPTIMIZACION:EXTRACCION\n");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(hijo.kill).not.toHaveBeenCalled();
    hijo.stderr.write("OPTIMIZACION:EXTRACCION\n");
    await vi.advanceTimersByTimeAsync(1); await rechazo;
    expect(diagnostico).toHaveBeenCalledOnce();
    expect(diagnostico.mock.calls[0]![0]).toMatchObject({ origenFin: "watchdog", fase: "extraccion" });
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
    await vi.advanceTimersByTimeAsync(1800_051); await rechazo;
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
    await vi.advanceTimersByTimeAsync(1800_000);
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

  it("mide etapas y progreso fragmentado sin modificar la salida JSON ni exponer texto libre", async () => {
    let ahora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => ahora);
    const hijo = proceso(), datos = entrada(), diagnostico = vi.fn();
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: diagnostico });
    ahora = 5; hijo.stderr.write("OPTIMIZACION:CARGA\n");
    ahora = 15; hijo.stderr.write("OPTIMIZACION:CONSTRUCCION\n");
    // Un progreso prematuro o con campos ajenos no es diagnóstico admitido.
    const progreso = { tiempoSolverSegundos: 1, nodos: 2, objetivoCandidato: 100, cotaDual: 80, brechaRelativa: 0.2 };
    hijo.stderr.write(`OPTIMIZACION:PROGRESO ${JSON.stringify(progreso)}\n`);
    ahora = 25; hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    ahora = 40;
    const linea = `OPTIMIZACION:PROGRESO ${JSON.stringify(progreso)}\n`;
    hijo.stderr.write(linea.slice(0, 30)); hijo.stderr.write(linea.slice(30));
    for (const dato of [{ ...progreso, secreto: "dato privado" }, { ...progreso, nodos: -1 }, { ...progreso, tiempoSolverSegundos: "NaN" }]) {
      hijo.stderr.write(`OPTIMIZACION:PROGRESO ${JSON.stringify(dato)}\n`);
    }
    hijo.stderr.write("OPTIMIZACION:PROGRESO no JSON ni dato privado\n");
    ahora = 65; hijo.stderr.write("OPTIMIZACION:EXTRACCION\n");
    const salida = { version: 1, revision: datos.revision, estado: "optimo", asignaciones: [], faltantes: [], protecciones: [], objetivo: 0 };
    hijo.stdout.write(JSON.stringify(salida)); ahora = 75; hijo.emit("close", 0, null);
    await expect(promesa).resolves.toEqual(salida);
    expect(diagnostico).toHaveBeenCalledOnce();
    expect(diagnostico.mock.calls[0]![0]).toMatchObject({ origenFin: "salida", fase: "extraccion",
      tiemposMs: { total: 75, arranque: 25, inicioJulia: 5, carga: 10, construccion: 10, llamadaSolver: 40, extraccion: 10 },
      muestrasProgreso: [progreso] });
    expect(JSON.stringify(diagnostico.mock.calls)).not.toContain("privado");
  });

  it("conserva diagnóstico acotado al vencer el watchdog y ningún evento lo prolonga", async () => {
    vi.useFakeTimers();
    const hijo = proceso(), diagnostico = vi.fn();
    const promesa = ejecutarJulia(entrada(), { ...opciones, alDiagnostico: diagnostico });
    const rechazo = expect(promesa).rejects.toThrow("tiempo de solver");
    hijo.stderr.write("OPTIMIZACION:SOLVER\n");
    for (let i = 0; i < 65; i++) {
      hijo.stderr.write(`OPTIMIZACION:PROGRESO ${JSON.stringify({ tiempoSolverSegundos: i, nodos: i, objetivoCandidato: null, cotaDual: null, brechaRelativa: null })}\n`);
    }
    await vi.advanceTimersByTimeAsync(1800_000);
    hijo.stderr.write("OPTIMIZACION:CARGA\nOPTIMIZACION:CONSTRUCCION\nOPTIMIZACION:SOLVER\n");
    await vi.advanceTimersByTimeAsync(51); await rechazo;
    expect(hijo.kill).toHaveBeenCalledWith("SIGKILL");
    const captura = diagnostico.mock.calls[0]![0] as DiagnosticoProcesoJulia;
    expect(captura).toMatchObject({ origenFin: "watchdog", fase: "solver" });
    expect(captura.muestrasProgreso).toHaveLength(60);
    expect(diagnostico).toHaveBeenCalledOnce();
  });

  it("separa transferencia y resolución sin alterar el JSON y omite hitos fuera de orden", async () => {
    let ahora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => ahora);
    const hijo = proceso(), datos = entrada(), diagnostico = vi.fn();
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: diagnostico });
    hijo.stderr.write("OPTIMIZACION:TRANSFERENCIA\nOPTIMIZACION:RESOLUCION\n");
    ahora = 10; hijo.stderr.write("OPTIMIZACION:SOLVER\nOPTIMIZACION:RESOLUCION\n");
    ahora = 12; hijo.stderr.write("OPTIMIZACION:TRANSFERENCIA\n");
    ahora = 18; hijo.stderr.write("OPTIMIZACION:TRANSFERENCIA\n");
    ahora = 32; hijo.stderr.write("OPTIMIZACION:RESOLU");
    hijo.stderr.write("CION\n");
    ahora = 40; hijo.stderr.write("OPTIMIZACION:RESOLUCION\nOPTIMIZACION:TRANSFERENCIA\n");
    ahora = 62; hijo.stderr.write("OPTIMIZACION:EXTRACCION\n");
    ahora = 65; hijo.stderr.write("OPTIMIZACION:RESOLUCION\nOPTIMIZACION:TRANSFERENCIA\n");
    const salida = { version: 1, revision: datos.revision, estado: "optimo", asignaciones: [], faltantes: [], protecciones: [], objetivo: 0 };
    hijo.stdout.write(JSON.stringify(salida)); ahora = 72; hijo.emit("close", 0, null);
    await expect(promesa).resolves.toEqual(salida);
    expect(diagnostico).toHaveBeenCalledOnce();
    expect(diagnostico.mock.calls[0]![0]).toMatchObject({ origenFin: "salida", fase: "extraccion",
      tiemposMs: { llamadaSolver: 52, transferencia: 20, resolucion: 30, extraccion: 10 } });
    expect(diagnostico.mock.calls[0]![0]).not.toHaveProperty("subfaseSolver");
  });

  it.each([false, true])("conserva la subfase al vencer sin renovar el plazo, resolución iniciada: %s", async resolucionIniciada => {
    vi.useFakeTimers();
    let ahora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => ahora);
    const hijo = proceso(), datos = entrada(), diagnostico = vi.fn();
    datos.parametros.limiteSolverSegundos = 1;
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: diagnostico });
    const rechazo = expect(promesa).rejects.toThrow("Julia excedió el tiempo de solver.");
    hijo.stderr.write("OPTIMIZACION:SOLVER\nOPTIMIZACION:TRANSFERENCIA\n");
    ahora = 1049;
    await vi.advanceTimersByTimeAsync(1049);
    hijo.stderr.write("OPTIMIZACION:TRANSFERENCIA\n");
    if (resolucionIniciada) hijo.stderr.write("OPTIMIZACION:RESOLUCION\n");
    expect(hijo.kill).not.toHaveBeenCalled();
    ahora = 1050;
    await vi.advanceTimersByTimeAsync(1); await rechazo;
    expect(hijo.kill).toHaveBeenCalledOnce();
    expect(hijo.kill).toHaveBeenCalledWith("SIGKILL");
    expect(diagnostico).toHaveBeenCalledOnce();
    const captura = diagnostico.mock.calls[0]![0] as DiagnosticoProcesoJulia;
    expect(captura).toMatchObject({ origenFin: "watchdog", fase: "solver",
      subfaseSolver: resolucionIniciada ? "resolucion" : "transferencia",
      tiemposMs: { llamadaSolver: 1050, transferencia: resolucionIniciada ? 1049 : 1050 } });
    if (resolucionIniciada) expect(captura.tiemposMs).toHaveProperty("resolucion", 1);
    else expect(captura.tiemposMs).not.toHaveProperty("resolucion");
  });

  it("mantiene el diagnóstico anterior sin inventar subfases cuando no llegan hitos nuevos", async () => {
    const hijo = proceso(), datos = entrada(), diagnostico = vi.fn();
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: diagnostico });
    hijo.stderr.write("OPTIMIZACION:SOLVER\nOPTIMIZACION:EXTRACCION\n");
    const salida = { version: 1, revision: datos.revision, estado: "optimo", asignaciones: [], faltantes: [], protecciones: [], objetivo: 0 };
    hijo.stdout.write(JSON.stringify(salida)); hijo.emit("close", 0, null);
    await expect(promesa).resolves.toEqual(salida);
    const captura = diagnostico.mock.calls[0]![0] as DiagnosticoProcesoJulia;
    expect(captura).not.toHaveProperty("subfaseSolver");
    expect(captura.tiemposMs).not.toHaveProperty("transferencia");
    expect(captura.tiemposMs).not.toHaveProperty("resolucion");
  });

  it("conserva solo hitos HiGHS permitidos, con configuración única y salida JSON intacta", async () => {
    let ahora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => ahora);
    const hijo = proceso(), datos = entrada(), diagnostico = vi.fn();
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: diagnostico });
    const configuracion = 'OPTIMIZACION:HIGHS_CONFIGURACION {"limiteSolverSegundos":600}\n';
    hijo.stderr.write(configuracion + "OPTIMIZACION:HIGHS_INICIO\n");
    ahora = 5; hijo.stderr.write("OPTIMIZACION:SOLVER\nOPTIMIZACION:TRANSFERENCIA\nOPTIMIZACION:HIGHS_INICIO\n");
    ahora = 10; hijo.stderr.write(configuracion.slice(0, 25)); hijo.stderr.write(configuracion.slice(25));
    ahora = 15; hijo.stderr.write("OPTIMIZACION:RESOLUCION\nOPTIMIZACION:HIGHS_INICIO\n");
    ahora = 25; hijo.stderr.write("OPTIMIZACION:HIGHS_PREPROCESAMIENTO\nOPTIMIZACION:HIGHS_INICIO\n");
    ahora = 30; hijo.stderr.write("OPTIMIZACION:HIGHS_FIN_PREPROCESAMIENTO\n");
    ahora = 40; hijo.stderr.write("OPTIMIZACION:HIGHS_BUSQUEDA\n");
    hijo.stderr.write('OPTIMIZACION:HIGHS_CONFIGURACION {"limiteSolverSegundos":300}\n');
    hijo.stderr.write("OPTIMIZACION:HIGHS_NO_DISPONIBLE\nOPTIMIZACION:HIGHS_dato_privado\n");
    hijo.stderr.write("Mensaje nativo con datos privados que no debe persistirse\n");
    ahora = 50; hijo.stderr.write("OPTIMIZACION:HIGHS_INFORME\nOPTIMIZACION:EXTRACCION\n");
    hijo.stderr.write("OPTIMIZACION:HIGHS_LIMITE_TIEMPO\n");
    const salida = { version: 1, revision: datos.revision, estado: "optimo", asignaciones: [], faltantes: [], protecciones: [], objetivo: 0 };
    hijo.stdout.write(JSON.stringify(salida)); hijo.emit("close", 0, null);
    await expect(promesa).resolves.toEqual(salida);
    expect(diagnostico).toHaveBeenCalledOnce();
    expect(diagnostico.mock.calls[0]![0]).toMatchObject({ registroHiGHS: {
      configurado: true, limiteSolverSegundos: 600, hitos: [
        { hito: "inicio", tiempoDesdeSolverMs: 10 },
        { hito: "preprocesamiento", tiempoDesdeSolverMs: 20 },
        { hito: "fin_preprocesamiento", tiempoDesdeSolverMs: 25 },
        { hito: "busqueda", tiempoDesdeSolverMs: 35 },
        { hito: "informe", tiempoDesdeSolverMs: 45 },
      ],
    } });
    expect(JSON.stringify(diagnostico.mock.calls)).not.toContain("privado");
  });

  it("ignora configuraciones HiGHS inválidas sin inventar un registro nativo", async () => {
    const hijo = proceso(), datos = entrada(), diagnostico = vi.fn();
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: diagnostico });
    hijo.stderr.write("OPTIMIZACION:SOLVER\nOPTIMIZACION:TRANSFERENCIA\n");
    for (const contenido of ['null', '[]', '{}', '{"limiteSolverSegundos":0}', '{"limiteSolverSegundos":1e31}',
      '{"limiteSolverSegundos":"600"}', '{"limiteSolverSegundos":1e999}',
      '{"limiteSolverSegundos":600,"privado":"dato"}', 'x'.repeat(513)]) {
      hijo.stderr.write(`OPTIMIZACION:HIGHS_CONFIGURACION ${contenido}\n`);
    }
    hijo.stderr.write("OPTIMIZACION:RESOLUCION\nOPTIMIZACION:HIGHS_INICIO\nOPTIMIZACION:EXTRACCION\n");
    const salida = { version: 1, revision: datos.revision, estado: "optimo", asignaciones: [], faltantes: [], protecciones: [], objetivo: 0 };
    hijo.stdout.write(JSON.stringify(salida)); hijo.emit("close", 0, null);
    await expect(promesa).resolves.toEqual(salida);
    expect(diagnostico.mock.calls[0]![0]).not.toHaveProperty("registroHiGHS");
  });

  it.each([false, true])("el registro HiGHS no renueva el watchdog ni reemplaza progreso, disponible: %s", async disponible => {
    vi.useFakeTimers();
    const hijo = proceso(), datos = entrada(), diagnostico = vi.fn();
    datos.parametros.limiteSolverSegundos = 1;
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: diagnostico });
    const rechazo = expect(promesa).rejects.toThrow("Julia excedió el tiempo de solver.");
    hijo.stderr.write("OPTIMIZACION:SOLVER\nOPTIMIZACION:TRANSFERENCIA\n");
    hijo.stderr.write(disponible ? 'OPTIMIZACION:HIGHS_CONFIGURACION {"limiteSolverSegundos":1}\n' : "OPTIMIZACION:HIGHS_NO_DISPONIBLE\n");
    hijo.stderr.write("OPTIMIZACION:RESOLUCION\n");
    for (let i = 0; i < 65; i++) hijo.stderr.write(`OPTIMIZACION:PROGRESO ${JSON.stringify({ tiempoSolverSegundos: i, nodos: i,
      objetivoCandidato: null, cotaDual: null, brechaRelativa: null })}\n`);
    await vi.advanceTimersByTimeAsync(1049);
    const hitos = ["INICIO", "PREPROCESAMIENTO", "FIN_PREPROCESAMIENTO", "PREPROCESAMIENTO_DESACTIVADO", "BUSQUEDA", "INFORME", "LIMITE_TIEMPO"];
    for (let i = 0; i < 2; i++) for (const hito of hitos) hijo.stderr.write(`OPTIMIZACION:HIGHS_${hito}\n`);
    hijo.stderr.write('OPTIMIZACION:HIGHS_CONFIGURACION {"limiteSolverSegundos":600}\n');
    expect(hijo.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rechazo;
    expect(hijo.kill).toHaveBeenCalledOnce();
    expect(hijo.kill).toHaveBeenCalledWith("SIGKILL");
    const captura = diagnostico.mock.calls[0]![0] as DiagnosticoProcesoJulia;
    expect(captura).toMatchObject({ origenFin: "watchdog", fase: "solver", registroHiGHS: { configurado: disponible } });
    expect(captura.registroHiGHS?.hitos).toHaveLength(disponible ? 7 : 0);
    if (disponible) expect(captura.registroHiGHS?.limiteSolverSegundos).toBe(1);
    else expect(captura.registroHiGHS).not.toHaveProperty("limiteSolverSegundos");
    expect(captura.muestrasProgreso).toHaveLength(60);
    expect(captura.progresoNoDisponible).toBe(false);
  });

  it("un observador defectuoso no cambia la admisión de una salida válida", async () => {
    const hijo = proceso(), datos = entrada();
    const promesa = ejecutarJulia(datos, { ...opciones, alDiagnostico: () => { throw new Error("dato privado"); } });
    const salida = { version: 1, revision: datos.revision, estado: "optimo", asignaciones: [], faltantes: [], protecciones: [], objetivo: 0 };
    hijo.stdout.write(JSON.stringify(salida)); hijo.emit("close", 0, null);
    await expect(promesa).resolves.toEqual(salida);
  });
});
