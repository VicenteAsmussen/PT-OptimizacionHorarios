import { afterEach, beforeEach, expect, it, vi } from "vitest";
import dotenv from "dotenv";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

const secretoPredeterminado = "supersecret_jwt_key_change_in_production";
const urlSintetica = "postgres://usuario_sintetico:clave_sintetica@127.0.0.1:1/pruebas";
const mensajePuerto = "PORT debe ser un número decimal entre 1 y 65535";
const mensajeSecretoProduccion = "JWT_SECRET debe configurarse con un valor no predeterminado en producción";
const secretoProduccion = "clave-sintetica-de-al-menos-32-bytes";

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
    JWT_EXPIRES_IN: "8h",
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
    vi.stubEnv("CLIENT_URL", "https://cliente.invalid");
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
    vi.stubEnv("CLIENT_URL", "https://cliente.invalid");
    vi.stubEnv("JWT_SECRET", secreto);
    await comprobarRechazo("JWT_SECRET", "JWT_SECRET no puede estar vacío");
    expect(process.env.JWT_SECRET).toBe(secreto);
  },
);

it.each(["x", "a".repeat(31), ` ${"a".repeat(31)} `])("rechaza un secreto productivo de menos de 32 bytes útiles: %j", async (secreto) => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CLIENT_URL", "https://cliente.invalid");
  vi.stubEnv("JWT_SECRET", secreto);
  await comprobarRechazo("JWT_SECRET", "JWT_SECRET debe contener al menos 32 bytes sin contar espacios exteriores en producción");
});

it.each(["a".repeat(32), secretoProduccion])("acepta longitud productiva suficiente sin modificar el secreto: %j", async (secreto) => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CLIENT_URL", "https://cliente.invalid");
  vi.stubEnv("JWT_SECRET", secreto);
  const { env } = await import("../src/config/env.js");
  expect(env.JWT_SECRET).toBe(secreto);
  expect(console.error).not.toHaveBeenCalled();
});

it.each([
  { secreto: `${"é".repeat(15)}a`, bytes: 31, valido: false },
  { secreto: "é".repeat(16), bytes: 32, valido: true },
])("valida el límite productivo por bytes UTF-8, no por caracteres: $bytes bytes", async ({ secreto, bytes, valido }) => {
  expect(Buffer.byteLength(secreto, "utf8")).toBe(bytes);
  expect(secreto.length).toBeLessThan(32);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CLIENT_URL", "https://cliente.invalid");
  vi.stubEnv("JWT_SECRET", secreto);
  if (valido) {
    const { env } = await import("../src/config/env.js");
    expect(env.JWT_SECRET).toBe(secreto);
    expect(console.error).not.toHaveBeenCalled();
  } else {
    await comprobarRechazo("JWT_SECRET", "JWT_SECRET debe contener al menos 32 bytes sin contar espacios exteriores en producción");
  }
  expect(process.env.JWT_SECRET).toBe(secreto);
});

it("rechaza NODE_ENV desconocido sin incorporar su valor al diagnóstico", async () => {
  vi.stubEnv("NODE_ENV", "entorno-sintetico-no-valido");
  await expect(import("../src/config/env.js")).rejects.toThrow("Configuración de entorno inválida");
  expect(console.error).toHaveBeenCalledOnce();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("entorno-sintetico-no-valido");
});

it("conserva secretos breves explícitos fuera de producción", async () => {
  vi.stubEnv("JWT_SECRET", "x");
  const { env } = await import("../src/config/env.js");
  expect(env.JWT_SECRET).toBe("x");
  expect(console.error).not.toHaveBeenCalled();
});

it("exige CLIENT_URL explícito en producción sin elegir un origen por el operador", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JWT_SECRET", secretoProduccion);
  await comprobarRechazo("CLIENT_URL", "CLIENT_URL debe configurarse explícitamente en producción");
});

it("acepta HTTP como origen normal en producción sin cambiar el entorno ni introducir un modo demo", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JWT_SECRET", secretoProduccion);
  vi.stubEnv("CLIENT_URL", "http://127.0.0.1:3000");
  const { env } = await import("../src/config/env.js");
  expect(env.NODE_ENV).toBe("production");
  expect(env.CLIENT_URL).toBe("http://127.0.0.1:3000");
  expect(console.error).not.toHaveBeenCalled();
});

it.each(["", "*", "null", "cliente.invalid", "https://cliente.invalid/ruta", "https://cliente.invalid?dato=1", "https://cliente.invalid#dato", "https://usuario:clave@cliente.invalid", "ftp://cliente.invalid"])(
  "rechaza CLIENT_URL que no es un origen HTTP exacto: %j", async (origen) => {
    vi.stubEnv("CLIENT_URL", origen);
    await comprobarRechazo("CLIENT_URL", "CLIENT_URL debe ser un origen HTTP o HTTPS sin credenciales, ruta, consulta ni fragmento");
  },
);

it.each(["http://localhost:5173", "https://cliente.invalid", "http://cliente.invalid:8080"])(
  "conserva un origen explícito válido sin imponer HTTPS: %s", async (origen) => {
    vi.stubEnv("CLIENT_URL", origen);
    const { env } = await import("../src/config/env.js");
    expect(env.CLIENT_URL).toBe(origen);
    expect(console.error).not.toHaveBeenCalled();
  },
);

it("rechaza DATABASE_URL compuesta solo por espacios sin intentar conectar", async () => {
  vi.stubEnv("DATABASE_URL", " \t\n");
  await comprobarRechazo("DATABASE_URL", "DATABASE_URL es obligatoria");
});

it.each(["", "incorrecta", "0s", "-1h", "120", "0.5s"])(
  "rechaza duración JWT inválida o sin un segundo completo: %j", async (duracion) => {
    vi.stubEnv("JWT_EXPIRES_IN", duracion);
    await comprobarRechazo("JWT_EXPIRES_IN", "JWT_EXPIRES_IN debe ser una duración válida de al menos un segundo");
  },
);

it.each(["8h", "2 days", "3600000", "1.5h", "1000"])(
  "conserva la sintaxis y las unidades de jsonwebtoken: %s", async (duracion) => {
    vi.stubEnv("JWT_EXPIRES_IN", duracion);
    const { env } = await import("../src/config/env.js");
    expect(env.JWT_EXPIRES_IN).toBe(duracion);
    expect(console.error).not.toHaveBeenCalled();
  },
);

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
