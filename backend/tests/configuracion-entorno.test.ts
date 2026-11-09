import { afterEach, beforeEach, expect, it, vi } from "vitest";
import dotenv from "dotenv";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

const secretoPredeterminado = "supersecret_jwt_key_change_in_production";
const urlSintetica = "postgres://usuario_sintetico:clave_sintetica@127.0.0.1:1/pruebas";
const mensajePuerto = "PORT debe ser un número decimal entre 1 y 65535";
const mensajeSecretoProduccion = "JWT_SECRET debe configurarse con un valor no predeterminado en producción";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DATABASE_URL", urlSintetica);
  for (const nombre of ["PORT", "CLIENT_URL", "JWT_SECRET", "JWT_EXPIRES_IN"]) {
    vi.stubEnv(nombre, undefined);
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function comprobarRechazo(campo: string, mensaje: string) {
  await expect(import("../src/config/env.js")).rejects.toThrow("Configuración de entorno inválida");
  expect(dotenv.config).toHaveBeenCalledExactlyOnceWith();
  expect(console.log).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledExactlyOnceWith("Configuración de entorno inválida:", {
    _errors: [],
    [campo]: { _errors: [mensaje] },
  });
}

it("informa en español una configuración incompleta sin cargar el archivo de entorno", async () => {
  vi.stubEnv("DATABASE_URL", "");
  await comprobarRechazo("DATABASE_URL", "DATABASE_URL es obligatoria");
});

it("conserva los valores predeterminados de desarrollo y la carga centralizada", async () => {
  vi.stubEnv("NODE_ENV", undefined);
  const { env } = await import("../src/config/env.js");
  expect(env).toEqual({
    PORT: 3000,
    NODE_ENV: "development",
    DATABASE_URL: urlSintetica,
    CLIENT_URL: "http://localhost:5173",
    JWT_SECRET: secretoPredeterminado,
    JWT_EXPIRES_IN: "7d",
  });
  expect(dotenv.config).toHaveBeenCalledExactlyOnceWith();
  expect(console.log).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

it("conserva las opciones explícitas sin normalizar el secreto ni la expiración", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PORT", "4321");
  vi.stubEnv("CLIENT_URL", "https://cliente.invalid");
  vi.stubEnv("JWT_SECRET", " secreto_sintetico ");
  vi.stubEnv("JWT_EXPIRES_IN", "9h");
  const { env } = await import("../src/config/env.js");
  expect(env).toEqual({
    PORT: 4321, NODE_ENV: "test", DATABASE_URL: urlSintetica,
    CLIENT_URL: "https://cliente.invalid", JWT_SECRET: " secreto_sintetico ", JWT_EXPIRES_IN: "9h",
  });
  expect(console.error).not.toHaveBeenCalled();
});

it.each([undefined, secretoPredeterminado, ` ${secretoPredeterminado} `])(
  "rechaza en producción el secreto ausente o predeterminado, caso %s", async (secreto) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", secreto);
    await comprobarRechazo("JWT_SECRET", mensajeSecretoProduccion);
    expect(process.env.JWT_SECRET).toBe(secreto);
  },
);

it.each(["development", "test", "production"].flatMap((entorno) =>
  ["", "   ", "\t\n"].map((secreto) => ({ entorno, secreto })),
))(
  "rechaza el secreto explícito '$secreto' vacío o en blanco en $entorno", async ({ entorno, secreto }) => {
    vi.stubEnv("NODE_ENV", entorno);
    vi.stubEnv("JWT_SECRET", secreto);
    await comprobarRechazo("JWT_SECRET", "JWT_SECRET no puede estar vacío");
    expect(process.env.JWT_SECRET).toBe(secreto);
  },
);

it("acepta un secreto explícito no predeterminado en producción sin imponer longitud", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JWT_SECRET", "x");
  const { env } = await import("../src/config/env.js");
  expect(env.JWT_SECRET).toBe("x");
  expect(console.error).not.toHaveBeenCalled();
});

it.each(["", " ", "NaN", "3000abc", "3000.5", "-1", "0", "65536", "1e3", "0x10", "+3000", " 3000", "3000 ", "3000\n", "3000\r\n", "999999999999999999999999999999999999999"])(
  "rechaza el puerto inválido %j sin modificar la entrada", async (puerto) => {
    vi.stubEnv("PORT", puerto);
    await comprobarRechazo("PORT", mensajePuerto);
    expect(process.env.PORT).toBe(puerto);
  },
);

it.each([["1", 1], ["65535", 65535], ["03000", 3000]])(
  "acepta el puerto decimal completo %s", async (entrada, esperado) => {
    vi.stubEnv("PORT", entrada);
    const { env } = await import("../src/config/env.js");
    expect(env.PORT).toBe(esperado);
    expect(console.error).not.toHaveBeenCalled();
  },
);
