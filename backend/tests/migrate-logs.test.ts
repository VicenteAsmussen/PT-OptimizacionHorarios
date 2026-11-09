import { afterEach, beforeEach, expect, it, vi } from "vitest";

const dobles = vi.hoisted(() => ({
  conectar: vi.fn(),
  adaptar: vi.fn(),
  migrar: vi.fn(),
  cerrar: vi.fn(),
  url: "postgres://usuario_sintetico:clave_sintetica@127.0.0.1:1/pruebas?dato=privado_sintetico",
}));

vi.mock("postgres", () => ({ default: dobles.conectar }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: dobles.adaptar }));
vi.mock("drizzle-orm/postgres-js/migrator", () => ({ migrate: dobles.migrar }));
vi.mock("../src/config/env.js", () => ({ env: { DATABASE_URL: dobles.url } }));

const conexion = { end: dobles.cerrar };
const baseSimulada = {};

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  dobles.conectar.mockReturnValue(conexion);
  dobles.adaptar.mockReturnValue(baseSimulada);
  dobles.migrar.mockResolvedValue(undefined);
  dobles.cerrar.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function ejecutarConDobles(codigo: number) {
  await import("../src/db/migrate.js");
  await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(codigo));
}

function comprobarFallo() {
  expect(console.log).toHaveBeenCalledExactlyOnceWith("Iniciando migraciones...");
  expect(console.error).toHaveBeenCalledExactlyOnceWith("No se pudieron aplicar las migraciones.");
}

it("migra con dobles, conserva las opciones y no registra el DSN en el inicio ni el éxito", async () => {
  await ejecutarConDobles(0);
  expect(dobles.conectar).toHaveBeenCalledExactlyOnceWith(dobles.url, { max: 1 });
  expect(dobles.adaptar).toHaveBeenCalledExactlyOnceWith(conexion);
  expect(dobles.migrar).toHaveBeenCalledExactlyOnceWith(baseSimulada, { migrationsFolder: "./src/db/migrations" });
  expect(dobles.cerrar).toHaveBeenCalledExactlyOnceWith();
  expect(vi.mocked(console.log).mock.calls).toEqual([
    ["Iniciando migraciones..."], ["Migraciones aplicadas correctamente."],
  ]);
  expect(console.error).not.toHaveBeenCalled();
  expect(dobles.cerrar.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(process.exit).mock.invocationCallOrder[0]!);
});

it("cierra la conexión cuando falla la migración y no registra el error con credenciales", async () => {
  dobles.migrar.mockRejectedValue(new Error(`Error sintético con DSN ${dobles.url}`));
  await ejecutarConDobles(1);
  comprobarFallo();
  expect(dobles.cerrar).toHaveBeenCalledExactlyOnceWith();
  expect(dobles.cerrar.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(process.exit).mock.invocationCallOrder[0]!);
});

it("no registra errores del driver ni intenta cerrar una conexión que no se creó", async () => {
  dobles.conectar.mockImplementation(() => { throw new Error(dobles.url); });
  await ejecutarConDobles(1);
  comprobarFallo();
  expect(dobles.adaptar).not.toHaveBeenCalled();
  expect(dobles.migrar).not.toHaveBeenCalled();
  expect(dobles.cerrar).not.toHaveBeenCalled();
});

it("cierra la conexión si falla la adaptación antes de migrar", async () => {
  dobles.adaptar.mockImplementation(() => { throw new Error(dobles.url); });
  await ejecutarConDobles(1);
  comprobarFallo();
  expect(dobles.migrar).not.toHaveBeenCalled();
  expect(dobles.cerrar).toHaveBeenCalledExactlyOnceWith();
});

it("informa un fallo de cierre sin publicar éxito ni credenciales", async () => {
  dobles.cerrar.mockRejectedValue(new Error(dobles.url));
  await ejecutarConDobles(1);
  comprobarFallo();
  expect(dobles.cerrar).toHaveBeenCalledExactlyOnceWith();
});

it("termina con fallo cuando fallan migración y cierre, sin inspeccionar los errores originales", async () => {
  const errorSintetico = { toString() { throw new Error("No se debe inspeccionar el error"); } };
  dobles.migrar.mockRejectedValue(errorSintetico);
  dobles.cerrar.mockRejectedValue(new Error(dobles.url));
  await ejecutarConDobles(1);
  comprobarFallo();
  expect(dobles.cerrar).toHaveBeenCalledExactlyOnceWith();
});
