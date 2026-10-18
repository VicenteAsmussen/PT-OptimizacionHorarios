import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { horariosRepository } from "../src/repositories/horarios.repository.js";

// Sin cliente PostgreSQL ni config/env: el proxy solo genera SQL y devuelve filas vacías.
const simulacion = vi.hoisted(() => ({
  consultas: [] as { sql: string; params: unknown[] }[],
  findMany: vi.fn(), departamento: vi.fn(), relacion: vi.fn(),
  actualizar: vi.fn(), transaccion: vi.fn(), devolver: vi.fn(),
}));
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const generador = drizzle(async (sql, params) => {
    simulacion.consultas.push({ sql, params });
    return { rows: [] };
  });
  return { db: {
    select: generador.select.bind(generador),
    query: {
      horariosAsignaturas: { findMany: simulacion.findMany },
      departamentos: { findFirst: simulacion.departamento },
      carreraDepartamento: { findFirst: simulacion.relacion },
    },
    transaction: simulacion.transaccion,
  } };
});
const dialecto = new PgDialect();
const compilar = (condicion: SQL) => dialecto.sqlToQuery(condicion);
const predicadoLectura = () => compilar(simulacion.findMany.mock.calls[0]![0].where);
const predicadoEscritura = () => compilar(simulacion.actualizar.mock.calls[0]![0]);

beforeEach(() => {
  vi.resetAllMocks();
  simulacion.consultas.length = 0;
  simulacion.findMany.mockResolvedValue([]);
  simulacion.departamento.mockResolvedValue({ id: 4 });
  simulacion.relacion.mockResolvedValue({ carreraId: 3, departamentoId: 4, esGestionado: false });
  simulacion.devolver.mockResolvedValue([{ id: 12 }]);
  simulacion.actualizar.mockReturnValue({ returning: simulacion.devolver });
  simulacion.transaccion.mockImplementation(async (operacion) => operacion({
    update: () => ({ set: () => ({ where: simulacion.actualizar }) }),
  }));
});

function comprobarGestionado(consulta: ReturnType<typeof compilar>, carreraId: number) {
  expect(consulta.sql).toContain('inner join "asignaturas"');
  expect(consulta.sql).toContain('"carrera_departamento"."departamento_id" = "asignaturas"."departamento_id"');
  // Un profesor de otro departamento no excluye la asignatura; el inverso tampoco la autoriza.
  expect(consulta.sql).not.toContain('"profesores"');
  expect(consulta.sql).toContain('"carrera_asignatura"."carrera_id" =');
  expect(consulta.sql).toContain('"carrera_departamento"."carrera_id" =');
  expect(consulta.sql).toContain('"carrera_departamento"."es_gestionado" =');
  expect(consulta.params.slice(-3)).toEqual([carreraId, carreraId, true]);
}

describe("Alcance Excel por departamento de asignatura (SQL sin BD)", () => {
  it.each([3, 99])("exportación/importación/actualización usan la misma carrera %s y departamento gestionado de asignatura, no profesor", async (carreraId) => {
    await horariosRepository.findParaExportarSalas(9, carreraId);
    const exportacion = predicadoLectura();
    comprobarGestionado(exportacion, carreraId);
    simulacion.findMany.mockClear();
    await horariosRepository.findParaImportarSalas(9, carreraId);
    expect(predicadoLectura()).toEqual(exportacion);
    await horariosRepository.actualizarSalasEnTransaccion(9, [{ id: 12, salaId: 5 }], carreraId);
    const actualizacion = predicadoEscritura();
    comprobarGestionado(actualizacion, carreraId);
    expect(actualizacion.params).toEqual([12, ...exportacion.params]);
    expect(actualizacion.sql).toContain('"horarios_asignaturas"."id" =');
  });

  it("no restringe la ocupación global a la carrera ni al departamento", async () => {
    await horariosRepository.findParaImportarSalas(9, 3);
    expect(simulacion.findMany).toHaveBeenCalledTimes(2);
    const global = compilar(simulacion.findMany.mock.calls[1]![0].where);
    expect(global.params).toEqual([9]);
    expect(global.sql).not.toMatch(/carrera|departamento|oferta_id/);
  });

  it("admin exporta, importa y actualiza sin carrera ni departamento; reutiliza ocupación global", async () => {
    await horariosRepository.findParaExportarSalas(9);
    const exportacion = predicadoLectura();
    expect(exportacion.params).toEqual([9]);
    expect(exportacion.sql).not.toMatch(/carrera|departamento/);
    simulacion.findMany.mockClear();
    const contexto = await horariosRepository.findParaImportarSalas(9);
    expect(predicadoLectura()).toEqual(exportacion);
    expect(simulacion.findMany).toHaveBeenCalledTimes(1);
    expect(contexto.entradasParaConflictos).toBe(contexto.entradas);
    await horariosRepository.actualizarSalasEnTransaccion(9, [{ id: 12, salaId: null }]);
    expect(predicadoEscritura().params).toEqual([12, 9]);
    expect(predicadoEscritura().sql).not.toMatch(/carrera|departamento/);
  });

  it("conserva la transacción y rechaza una sesión que perdió el alcance", async () => {
    simulacion.devolver.mockResolvedValue([]);
    await expect(horariosRepository.actualizarSalasEnTransaccion(9, [{ id: 12, salaId: 5 }], 3))
      .rejects.toThrow("El horario cambió durante la importación");
    expect(simulacion.transaccion).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 3, 99])("externos limita asignaturas al departamento solicitado aun para carrera %s/admin", async (carreraId) => {
    await horariosRepository.findContextoExternos(9, 4, carreraId);
    const consulta = simulacion.consultas.find((consulta) => consulta.sql.startsWith('select') && consulta.sql.includes('from "asignaturas"'))!;
    expect(consulta.sql).toContain('"asignaturas"."departamento_id" =');
    expect(consulta.params[0]).toBe(4); // Excluye cualquier asignatura de otro departamento.
    if (carreraId === undefined) {
      expect(consulta.params).toEqual([4]);
      expect(consulta.sql).not.toContain('"carrera_asignatura"');
      expect(simulacion.relacion).not.toHaveBeenCalled();
    } else {
      expect(consulta.sql).toContain('"carrera_asignatura"."carrera_id" =');
      expect(consulta.params).toEqual([4, carreraId]);
      const autorizacion = compilar(simulacion.relacion.mock.calls[0]![0].where);
      expect(autorizacion.params).toEqual([carreraId, 4, false]);
      expect(autorizacion.sql).toContain('"carrera_departamento"."es_gestionado" =');
    }
    const profesores = simulacion.consultas.find((consulta) => consulta.sql.includes('from "profesores"'))!;
    expect(profesores.sql).toContain('"profesores"."departamento_id" =');
    expect(profesores.params).toEqual([4]);
    const ocupaciones = simulacion.consultas.find((consulta) => consulta.sql.includes('from "horarios_asignaturas"'))!;
    expect(ocupaciones.params).toEqual([9]);
    expect(ocupaciones.sql).not.toMatch(/carrera|departamento/);
  });

  it("secretaría no puede importar externos de un departamento gestionado o de otra carrera", async () => {
    simulacion.relacion.mockResolvedValue(undefined);
    expect((await horariosRepository.findContextoExternos(9, 4, 3)).departamentoValido).toBe(false);
    expect((await horariosRepository.findContextoExternos(9, 4)).departamentoValido).toBe(true);
    simulacion.departamento.mockResolvedValue(undefined);
    expect((await horariosRepository.findContextoExternos(9, 4)).departamentoValido).toBe(false);
  });
});
