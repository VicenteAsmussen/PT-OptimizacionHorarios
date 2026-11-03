import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simulaciones = vi.hoisted(() => ({
  entorno: { NODE_ENV: "test", DATABASE_URL: "" as string | undefined },
  cliente: {},
  postgres: vi.fn(),
  drizzle: vi.fn(),
}));

vi.mock("../src/config/env.js", () => ({ env: simulaciones.entorno }));
vi.mock("postgres", () => ({ default: simulaciones.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: simulaciones.drizzle }));
vi.mock("../src/db/schema/index.js", () => ({}));

const destinoPruebas = "postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_test";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  simulaciones.postgres.mockReturnValue(simulaciones.cliente);
  simulaciones.drizzle.mockReturnValue({});
  simulaciones.entorno.NODE_ENV = "test";
  simulaciones.entorno.DATABASE_URL = destinoPruebas;
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PRUEBAS_EN_EJECUCION", "yes");
  vi.stubEnv("BASE_PRUEBAS_REINICIABLE", "yes");
});

afterEach(() => vi.unstubAllEnvs());

describe("Protección de la conexión durante las pruebas", () => {
  it.each([
    undefined,
    "no-es-url",
    destinoPruebas.replace("horarios_test", "horarios_db"),
    destinoPruebas.replace("@postgres:", "@localhost:"),
    destinoPruebas.replace(":5432/", ":5433/"),
    destinoPruebas.replace("//pruebas_horarios:", "//postgres:"),
    `${destinoPruebas}?host=otro`,
    `${destinoPruebas}#otro`,
  ])("rechaza un destino no autorizado antes de crear el cliente: %s", async destino => {
    simulaciones.entorno.DATABASE_URL = destino;
    await expect(import("../src/config/db.js")).rejects.toThrow(/pruebas/);
    expect(simulaciones.postgres).not.toHaveBeenCalled();
    expect(simulaciones.drizzle).not.toHaveBeenCalled();
    expect(simulaciones.entorno.DATABASE_URL).toBe(destino);
  });

  it("rechaza la conexión sin confirmación explícita", async () => {
    vi.stubEnv("BASE_PRUEBAS_REINICIABLE", undefined);
    await expect(import("../src/config/db.js")).rejects.toThrow(/pruebas/);
    expect(simulaciones.postgres).not.toHaveBeenCalled();
  });

  it.each(["development", "production"])("el marcador de pruebas impide eludir la protección con NODE_ENV=%s", async entorno => {
    simulaciones.entorno.NODE_ENV = entorno;
    vi.stubEnv("NODE_ENV", entorno);
    await expect(import("../src/config/db.js")).rejects.toThrow(/pruebas/);
    expect(simulaciones.postgres).not.toHaveBeenCalled();
  });

  it("permite el destino de pruebas autorizado sin reemplazar la URL", async () => {
    const conexion = await import("../src/config/db.js");
    expect(simulaciones.postgres).toHaveBeenCalledExactlyOnceWith(destinoPruebas);
    expect(conexion.queryClient).toBe(simulaciones.cliente);
    expect(simulaciones.entorno.DATABASE_URL).toBe(destinoPruebas);
  });

  it.each(["development", "production"])("conserva la conexión de aplicación fuera de pruebas en %s", async entorno => {
    simulaciones.entorno.NODE_ENV = entorno;
    simulaciones.entorno.DATABASE_URL = "postgres://aplicacion:valor-simulado@servidor:5432/aplicacion";
    vi.stubEnv("NODE_ENV", entorno);
    vi.stubEnv("PRUEBAS_EN_EJECUCION", undefined);
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("VITEST_WORKER_ID", undefined);
    await import("../src/config/db.js");
    expect(simulaciones.postgres).toHaveBeenCalledExactlyOnceWith(simulaciones.entorno.DATABASE_URL);
  });
});
