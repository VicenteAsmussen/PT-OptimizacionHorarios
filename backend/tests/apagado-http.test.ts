import { once } from "node:events";
import { get, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dobles = vi.hoisted(() => ({
  recuperar: vi.fn(), julia: vi.fn(), optimizacion: vi.fn(), sql: vi.fn(),
  atender: vi.fn(), servidor: undefined as Server | undefined,
}));

vi.mock("node:http", async (importar) => {
  const original = await importar<typeof import("node:http")>();
  return { ...original, createServer: (...argumentos: Parameters<typeof original.createServer>) => {
    const servidor = original.createServer(...argumentos);
    const escuchar = servidor.listen.bind(servidor);
    // El servidor de producción usa un puerto efímero y solo loopback en este arnés.
    servidor.listen = ((puerto: number, listo: () => void) => escuchar(puerto, "127.0.0.1", listo)) as typeof servidor.listen;
    dobles.servidor = servidor;
    return servidor;
  } };
});
vi.mock("../src/app.js", async () => {
  const { createServer } = await import("node:http");
  const app = Object.assign((solicitud: IncomingMessage, respuesta: ServerResponse) => dobles.atender(solicitud, respuesta), {
    listen: (puerto: number, listo: () => void) => createServer(app).listen(puerto, listo),
  });
  return { app };
});
vi.mock("../src/config/env.js", () => ({ env: { PORT: 0, NODE_ENV: "test" } }));
vi.mock("../src/config/db.js", () => ({ queryClient: { end: dobles.sql } }));
vi.mock("../src/repositories/optimizacion.repository.js", () => ({ optimizacionRepository: { recuperar: dobles.recuperar } }));
vi.mock("../src/services/optimizacion.service.js", () => ({ cerrarOptimizacion: dobles.optimizacion }));
vi.mock("../src/optimizacion/index.js", () => ({ cerrarProcesosJulia: dobles.julia }));

function diferida<T = void>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>(resolve => { resolver = resolve; });
  return { promesa, resolver };
}

let senales: Record<"SIGINT" | "SIGTERM", (() => void)[]>;
let intervalos: ReturnType<typeof setInterval>[];
let peticiones: Promise<unknown>[];

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  dobles.servidor = undefined;
  dobles.recuperar.mockResolvedValue(undefined);
  dobles.optimizacion.mockResolvedValue(undefined);
  dobles.sql.mockResolvedValue(undefined);
  dobles.atender.mockImplementation((_solicitud, respuesta: ServerResponse) => respuesta.end("ok"));
  senales = { SIGINT: [], SIGTERM: [] };
  intervalos = [];
  peticiones = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  for (const metodo of ["on", "once"] as const) {
    const registrar = process[metodo].bind(process);
    vi.spyOn(process, metodo).mockImplementation(((evento: string, listener: () => void) => {
      if (evento === "SIGINT" || evento === "SIGTERM") { senales[evento].push(listener); return process; }
      return registrar(evento, listener);
    }) as typeof process[typeof metodo]);
  }
  const programar = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((...argumentos: Parameters<typeof setInterval>) => {
    const intervalo = programar(...argumentos);
    intervalos.push(intervalo);
    return intervalo;
  }) as typeof setInterval);
});

afterEach(async () => {
  vi.useRealTimers();
  for (const intervalo of intervalos) clearInterval(intervalo);
  const servidor = dobles.servidor;
  if (servidor) {
    servidor.closeAllConnections();
    if (servidor.listening) await new Promise<void>(resolve => servidor.close(() => resolve()));
    servidor.removeAllListeners();
  }
  await Promise.allSettled(peticiones);
  vi.restoreAllMocks();
});

async function iniciar() {
  await import("../src/server.js");
  const servidor = dobles.servidor!;
  if (!servidor.listening) await once(servidor, "listening");
  await vi.waitFor(() => expect(console.log).toHaveBeenCalled());
  return servidor;
}

function solicitar(servidor: Server) {
  const direccion = servidor.address();
  if (!direccion || typeof direccion === "string") throw new Error("No existe puerto de prueba.");
  const peticion = new Promise<{ codigo: number; cuerpo: string }>((resolve, reject) => {
    get({ hostname: "127.0.0.1", port: direccion.port, agent: false }, respuesta => {
      let cuerpo = "";
      respuesta.setEncoding("utf8");
      respuesta.on("data", fragmento => { cuerpo += fragmento; });
      respuesta.on("end", () => resolve({ codigo: respuesta.statusCode!, cuerpo }));
      respuesta.on("error", reject);
    }).on("error", reject);
  });
  // Una aserción RED puede fallar antes del await, el teardown cierra ese socket.
  void peticion.catch(() => {});
  peticiones.push(peticion);
  return peticion;
}

describe("apagado del servidor por señales", () => {
  it.each(["SIGINT", "SIGTERM"] as const)("%s detiene conexiones y drena la respuesta antes de Julia, optimización, SQL y salida", async senal => {
    const recibida = diferida<ServerResponse>();
    dobles.atender.mockImplementation((_solicitud, respuesta) => recibida.resolver(respuesta));
    const servidor = await iniciar();
    const cierreHttp = vi.spyOn(servidor, "close");
    const forzar = vi.spyOn(servidor, "closeAllConnections");
    const respuestaPendiente = solicitar(servidor);
    const respuesta = await recibida.promesa;
    senales[senal][0]!();
    expect(servidor.listening).toBe(false);
    expect(cierreHttp).toHaveBeenCalledTimes(1);
    expect(cierreHttp.mock.calls[0]![0]).toBeTypeOf("function");
    expect(dobles.julia).not.toHaveBeenCalled();
    expect(dobles.optimizacion).not.toHaveBeenCalled();
    expect(dobles.sql).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    senales[senal][0]!();
    senales[senal === "SIGINT" ? "SIGTERM" : "SIGINT"][0]!();
    respuesta.end("respuesta terminada");
    await expect(respuestaPendiente).resolves.toEqual({ codigo: 200, cuerpo: "respuesta terminada" });
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
    expect(dobles.julia).toHaveBeenCalledTimes(1);
    expect(dobles.optimizacion).toHaveBeenCalledTimes(1);
    expect(dobles.sql).toHaveBeenCalledExactlyOnceWith({ timeout: 5 });
    expect(dobles.julia.mock.invocationCallOrder[0]).toBeLessThan(dobles.optimizacion.mock.invocationCallOrder[0]!);
    expect(dobles.optimizacion.mock.invocationCallOrder[0]).toBeLessThan(dobles.sql.mock.invocationCallOrder[0]!);
    expect(dobles.sql.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(process.exit).mock.invocationCallOrder[0]!);
    expect(forzar).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("conserva el mensaje de arranque, las respuestas y la recuperación inicial y periódica", async () => {
    const servidor = await iniciar();
    expect(console.log).toHaveBeenCalledExactlyOnceWith("🚀 Server running on http://localhost:0 in test mode");
    await expect(solicitar(servidor)).resolves.toEqual({ codigo: 200, cuerpo: "ok" });
    expect(dobles.recuperar).toHaveBeenCalledTimes(1);
    const programacion = vi.mocked(setInterval).mock.calls.find(([, plazo]) => plazo === 15000)!;
    (programacion[0] as () => void)();
    await vi.waitFor(() => expect(dobles.recuperar).toHaveBeenCalledTimes(2));
    senales.SIGTERM[0]!();
    (programacion[0] as () => void)();
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
    expect(dobles.recuperar).toHaveBeenCalledTimes(2);
  });

  it.each(["inicial", "periódica"])("espera la recuperación %s ya iniciada antes de cerrar SQL", async tipo => {
    const recuperacion = diferida();
    if (tipo === "inicial") dobles.recuperar.mockReturnValue(recuperacion.promesa);
    await iniciar();
    if (tipo === "periódica") {
      dobles.recuperar.mockReturnValue(recuperacion.promesa);
      const programacion = vi.mocked(setInterval).mock.calls.find(([, plazo]) => plazo === 15000)!;
      (programacion[0] as () => void)();
    }
    senales.SIGINT[0]!();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(dobles.sql).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    recuperacion.resolver();
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
  });

  it.each(["inicial", "periódica"])("conserva el diagnóstico seguro cuando falla la recuperación %s", async tipo => {
    if (tipo === "inicial") dobles.recuperar.mockRejectedValue(new Error("dato privado sintético"));
    await iniciar();
    if (tipo === "periódica") {
      dobles.recuperar.mockRejectedValue(new Error("dato privado sintético"));
      const programacion = vi.mocked(setInterval).mock.calls.find(([, plazo]) => plazo === 15000)!;
      (programacion[0] as () => void)();
    }
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledExactlyOnceWith(tipo === "inicial"
      ? "No se pudo comprobar la recuperación inicial del modelo."
      : "No se pudo comprobar la recuperación de ejecuciones del modelo."));
    senales.SIGTERM[0]!();
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
  });

  it.each(["julia", "optimizacion", "sql"] as const)("la señal controla el fallo de %s y cierra los recursos restantes", async recurso => {
    if (recurso === "julia") dobles.julia.mockImplementation(() => { throw new Error("dato privado"); });
    else dobles[recurso].mockRejectedValue(new Error("dato privado"));
    await iniciar();
    senales.SIGTERM[0]!();
    senales.SIGINT[0]!();
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(1));
    expect(dobles.julia).toHaveBeenCalledTimes(1);
    expect(dobles.optimizacion).toHaveBeenCalledTimes(1);
    expect(dobles.sql).toHaveBeenCalledExactlyOnceWith({ timeout: 5 });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("privado");
  });

  it("rechaza nuevas solicitudes en una conexión existente sin entrar a la aplicación durante el drenaje", async () => {
    const recibida = diferida<ServerResponse>();
    dobles.atender.mockImplementation((_solicitud, respuesta) => recibida.resolver(respuesta));
    const servidor = await iniciar();
    const pendiente = solicitar(servidor);
    const respuesta = await recibida.promesa;
    senales.SIGTERM[0]!();
    const nueva = { writeHead: vi.fn(), end: vi.fn() };
    servidor.emit("request", {} as IncomingMessage, nueva);
    expect(dobles.atender).toHaveBeenCalledTimes(1);
    expect(nueva.writeHead).toHaveBeenCalledExactlyOnceWith(503, { Connection: "close", "Content-Type": "text/plain; charset=utf-8" });
    expect(nueva.end).toHaveBeenCalledExactlyOnceWith("El servidor está cerrando.");
    respuesta.end("ok");
    await pendiente;
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
  });
});

describe("límites y fallos del cierre con dobles", () => {
  async function preparar() {
    const { crearApagado } = await import("../src/utils/apagado.js");
    let completar!: (error?: Error) => void;
    const servidor = {
      close: vi.fn((callback: (error?: Error) => void) => { completar = callback; }),
      closeIdleConnections: vi.fn(), closeAllConnections: vi.fn(),
    };
    const opciones = {
      servidor, detenerRecuperacion: vi.fn().mockResolvedValue(undefined),
      cerrarJulia: vi.fn(), cerrarOptimizacion: vi.fn().mockResolvedValue(undefined),
      cerrarSql: vi.fn().mockResolvedValue(undefined), salir: vi.fn(), informar: vi.fn(),
    };
    return { ...crearApagado(opciones), opciones, completar: (error?: Error) => completar(error) };
  }

  it("espera el callback, cierra conexiones ociosas después de close y limpia el temporizador unref", async () => {
    vi.useFakeTimers();
    const arnes = await preparar();
    const temporizar = vi.spyOn(globalThis, "setTimeout");
    const primera = arnes.cerrar();
    expect(arnes.cerrar()).toBe(primera);
    expect(arnes.estaCerrando()).toBe(true);
    const { servidor, cerrarJulia, salir } = arnes.opciones;
    expect(servidor.close.mock.invocationCallOrder[0]).toBeLessThan(servidor.closeIdleConnections.mock.invocationCallOrder[0]!);
    expect(cerrarJulia).not.toHaveBeenCalled();
    const temporizador = temporizar.mock.results[0]!.value as NodeJS.Timeout;
    expect(temporizador.hasRef()).toBe(false);
    arnes.completar();
    await primera;
    expect(salir).toHaveBeenCalledExactlyOnceWith(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(servidor.closeAllConnections).not.toHaveBeenCalled();
  });

  it("no fuerza una petición antes de 30 segundos y al vencer cierra conexiones y sale una sola vez con 1", async () => {
    vi.useFakeTimers();
    const arnes = await preparar();
    const pendiente = arnes.cerrar();
    await vi.advanceTimersByTimeAsync(29999);
    expect(arnes.opciones.servidor.closeAllConnections).not.toHaveBeenCalled();
    expect(arnes.opciones.salir).not.toHaveBeenCalled();
    expect(arnes.opciones.cerrarSql).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pendiente;
    expect(arnes.opciones.servidor.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(arnes.opciones.salir).toHaveBeenCalledExactlyOnceWith(1);
    expect(arnes.opciones.informar).toHaveBeenCalledExactlyOnceWith("Se agotó el tiempo de apagado del servidor.");
    expect(vi.getTimerCount()).toBe(0);
    arnes.completar();
    await arnes.cerrar();
    expect(arnes.opciones.cerrarSql).not.toHaveBeenCalled();
    expect(arnes.opciones.salir).toHaveBeenCalledTimes(1);
  });

  it("el límite también impide esperar indefinidamente una recuperación sin cerrar SQL bajo ella", async () => {
    vi.useFakeTimers();
    const arnes = await preparar();
    const recuperacion = diferida();
    arnes.opciones.detenerRecuperacion.mockReturnValue(recuperacion.promesa);
    const pendiente = arnes.cerrar();
    arnes.completar();
    await vi.advanceTimersByTimeAsync(30000);
    await pendiente;
    expect(arnes.opciones.salir).toHaveBeenCalledExactlyOnceWith(1);
    expect(arnes.opciones.cerrarSql).not.toHaveBeenCalled();
    recuperacion.resolver();
    await Promise.resolve();
    expect(arnes.opciones.cerrarSql).not.toHaveBeenCalled();
  });

  it("el límite controla un cierre de optimización bloqueado y un fallo al forzar conexiones", async () => {
    vi.useFakeTimers();
    const arnes = await preparar();
    const optimizacion = diferida();
    arnes.opciones.cerrarOptimizacion.mockReturnValue(optimizacion.promesa);
    arnes.opciones.servidor.closeAllConnections.mockImplementation(() => { throw new Error("privado"); });
    const pendiente = arnes.cerrar();
    arnes.completar();
    await vi.advanceTimersByTimeAsync(29999);
    expect(arnes.opciones.cerrarOptimizacion).toHaveBeenCalledTimes(1);
    expect(arnes.opciones.salir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pendiente;
    expect(arnes.opciones.salir).toHaveBeenCalledExactlyOnceWith(1);
    expect(arnes.opciones.informar.mock.calls).toEqual([
      ["Se agotó el tiempo de apagado del servidor."], ["No se pudieron cerrar las conexiones HTTP activas."],
    ]);
    optimizacion.resolver();
    await Promise.resolve();
    expect(arnes.opciones.cerrarSql).not.toHaveBeenCalled();
  });

  it.each(["cerrarJulia", "cerrarOptimizacion", "cerrarSql", "detenerRecuperacion"] as const)("continúa con los demás recursos y termina con 1 si falla %s", async recurso => {
    const arnes = await preparar();
    arnes.opciones[recurso].mockImplementation(() => { throw new Error("postgres://privado:sintetico@destino/base"); });
    const pendiente = arnes.cerrar();
    arnes.completar();
    await pendiente;
    expect(arnes.opciones.cerrarJulia).toHaveBeenCalledTimes(1);
    expect(arnes.opciones.cerrarOptimizacion).toHaveBeenCalledTimes(1);
    expect(arnes.opciones.cerrarSql).toHaveBeenCalledTimes(1);
    expect(arnes.opciones.salir).toHaveBeenCalledExactlyOnceWith(1);
    expect(arnes.opciones.informar).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(arnes.opciones.informar.mock.calls)).not.toMatch(/postgres|privado|sintetico|destino/);
  });

  it.each(["ERR_SERVER_NOT_RUNNING", "EIO"])("atiende el error de callback %s sin ocultar el fallo primario ni el de SQL", async codigo => {
    const arnes = await preparar();
    arnes.opciones.cerrarSql.mockRejectedValue(new Error("privado"));
    const pendiente = arnes.cerrar();
    arnes.completar(Object.assign(new Error("privado"), { code: codigo }));
    await pendiente;
    expect(arnes.opciones.salir).toHaveBeenCalledExactlyOnceWith(1);
    expect(arnes.opciones.informar.mock.calls).toEqual([
      ["No se pudo cerrar el servidor HTTP."], ["No se pudo cerrar la conexión SQL."],
    ]);
    expect(arnes.opciones.cerrarOptimizacion).toHaveBeenCalledTimes(1);
    expect(arnes.opciones.cerrarSql).toHaveBeenCalledTimes(1);
  });

  it("atiende errores síncronos de close y de cierre ocioso sin rechazos no manejados", async () => {
    const arnes = await preparar();
    arnes.opciones.servidor.close.mockImplementation(() => { throw new Error("privado"); });
    arnes.opciones.servidor.closeIdleConnections.mockImplementation(() => { throw new Error("privado"); });
    await arnes.cerrar();
    expect(arnes.opciones.salir).toHaveBeenCalledExactlyOnceWith(1);
    expect(arnes.opciones.cerrarSql).toHaveBeenCalledTimes(1);
    expect(arnes.opciones.informar.mock.calls).toEqual([
      ["No se pudo cerrar el servidor HTTP."], ["No se pudieron cerrar las conexiones HTTP ociosas."],
    ]);
  });
});
