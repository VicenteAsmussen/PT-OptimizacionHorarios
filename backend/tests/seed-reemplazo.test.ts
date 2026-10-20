import { describe, expect, it, vi } from "vitest";
import * as esquema from "../src/db/schema/index.js";
import type { BaseDatosSeed } from "../src/db/seeds/contexto.js";
import { reemplazarAcademico } from "../src/db/seeds/reemplazo.js";

vi.mock("../src/db/seeds/academico.js", () => ({ sembrarAcademico: vi.fn(async () => ({ carreras: [], departamentos: [] })) }));
vi.mock("../src/db/seeds/usuarios.js", () => ({ sembrarUsuarios: vi.fn(async () => {}) }));
import { sembrarAcademico } from "../src/db/seeds/academico.js";
import { sembrarUsuarios } from "../src/db/seeds/usuarios.js";

function crearBase(conflicto = false) {
  const eliminaciones: unknown[] = [];
  const base = {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => conflicto ? [{ id: 1 }] : [] }) }) }),
    delete: (tabla: unknown) => {
      eliminaciones.push(tabla);
      return { where: async () => {}, then: (resolver: () => void) => Promise.resolve().then(resolver) };
    },
    transaction: vi.fn(async (operacion: (tx: unknown) => Promise<void>) => operacion(base)),
  };
  return { base: base as unknown as BaseDatosSeed, eliminaciones };
}

describe("explicit local academic replacement", () => {
  it.each([
    ["postgres://postgres:postgres@db.example.com/horarios_db", "development"],
    ["postgres://postgres:postgres@localhost/production", "development"],
    ["postgres://postgres:postgres@localhost/horarios_db", "production"],
  ])("refuses unsafe targets before any query", async (conexion, entorno) => {
    const { base, eliminaciones } = crearBase();
    await expect(reemplazarAcademico(base, conexion, entorno)).rejects.toThrow();
    expect(eliminaciones).toEqual([]);
    expect(base.transaction).not.toHaveBeenCalled();
  });

  it("refuses to delete a teacher profile linked to an administrative account", async () => {
    const { base, eliminaciones } = crearBase(true);
    await expect(reemplazarAcademico(base, "postgres://postgres:postgres@localhost/horarios_db", "development")).rejects.toThrow();
    expect(eliminaciones).toEqual([]);
  });

  it("replaces dependent academic data in one transaction without deleting administrative catalogs", async () => {
    const { base, eliminaciones } = crearBase();
    await reemplazarAcademico(base, "postgres://postgres:postgres@localhost/horarios_db", "development");
    expect(eliminaciones).toEqual([esquema.ofertasAsignaturas, esquema.profesores, esquema.usuarios, esquema.asignaturas]);
    expect(base.transaction).toHaveBeenCalledTimes(1);
    expect(sembrarAcademico).toHaveBeenCalledWith(base);
    expect(sembrarUsuarios).toHaveBeenCalledWith(base, { carreras: [], departamentos: [] }, true);
  });

  it("propagates insertion errors so the database transaction rolls back", async () => {
    vi.mocked(sembrarAcademico).mockRejectedValueOnce(new Error("insertion failed"));
    const { base } = crearBase();
    await expect(reemplazarAcademico(base, "postgres://postgres:postgres@localhost/horarios_db", "development")).rejects.toThrow("insertion failed");
  });
});
