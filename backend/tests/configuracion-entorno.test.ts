import { afterEach, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("informa en español una configuración incompleta sin cargar el archivo de entorno", async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "");
  const registrarError = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(import("../src/config/env.js")).rejects.toThrow("Configuración de entorno inválida");
  expect(registrarError).toHaveBeenCalledWith("Configuración de entorno inválida:", expect.objectContaining({
    DATABASE_URL: { _errors: ["DATABASE_URL es obligatoria"] },
  }));
});
