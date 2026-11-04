import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/repositories/optimizacion-bloqueos.js", () => ({ exigirSinEjecucionActiva: vi.fn() }));

const registro = vi.hoisted(() => ({ sentencias: [] as { sql: string; parametros: unknown[] }[], respuestas: [] as (unknown[][] | Error)[], transaccion: vi.fn() }));
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const esquema = await import("../src/db/schema/index.js");
  const base = drizzle(async (sql, parametros) => {
    registro.sentencias.push({ sql, parametros });
    const respuesta = registro.respuestas.shift() ?? [];
    if (respuesta instanceof Error) throw respuesta;
    return { rows: respuesta };
  }, { schema: esquema });
  base.transaction = registro.transaccion.mockImplementation(async operar => operar(base));
  return { db: base };
});
import { resultadosHorariosRepository } from "../src/repositories/resultados-horarios.repository.js";

beforeEach(() => { registro.sentencias.length = 0; registro.respuestas.length = 0; registro.transaccion.mockClear(); });
function contextoVacio() {
  const planificacion = [9, 3, "2026-1", true, "propuesta"];
  registro.respuestas.push([planificacion], [[3]], [planificacion], [planificacion], [], [], [], [], [], [], [], []);
}
describe("Proposal repository transaction SQL", () => {
  it("locks career before planning and relocates all original IDs in one transaction", async () => {
    contextoVacio();
    registro.respuestas.push([[100, 1, 4, 1, 1, 9], [101, 1, 4, 2, 1, 9]], [[9, 3, "2026-1", true, "propuesta"]], [], [], []);
    await resultadosHorariosRepository.conBloqueo(9, async (_contexto, persistencia) => {
      await persistencia.mover([{ id: 100, bloqueId: 5 }, { id: 101, bloqueId: 6 }]);
    });
    expect(registro.transaccion).toHaveBeenCalledOnce();
    expect(registro.sentencias[1]!.sql).toMatch(/from "carreras".*for update/);
    expect(registro.sentencias[2]!.sql).toMatch(/from "planificaciones_semestres".*for update/);
    const eliminacion = registro.sentencias.at(-2)!; const insercion = registro.sentencias.at(-1)!;
    expect(eliminacion.sql).toContain('delete from "horarios_asignaturas"');
    expect(eliminacion.parametros).toEqual([9, 100, 101]);
    expect(insercion.sql).toContain('insert into "horarios_asignaturas"');
    expect(insercion.parametros).toEqual([100, 1, 4, 5, 1, 9, 101, 1, 4, 6, 1, 9]);
  });
  it("refuses a missing source before any deletion", async () => {
    contextoVacio(); registro.respuestas.push([[100, 1, 4, 1, 1, 9]]);
    await expect(resultadosHorariosRepository.conBloqueo(9, async (_contexto, persistencia) => {
      await persistencia.mover([{ id: 100, bloqueId: 5 }, { id: 101, bloqueId: 6 }]);
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(registro.sentencias.every(sentencia => sentencia.sql.startsWith("select "))).toBe(true);
  });
  it("valida la reserva de la carrera antes de eliminar un grupo para moverlo", async () => {
    contextoVacio();
    registro.respuestas.push([[100, 1, 4, 1, 1, 9], [101, 1, 4, 2, 1, 9]], [[9, 3, "2026-1", true, "propuesta"]], [[3, 6]]);
    await expect(resultadosHorariosRepository.conBloqueo(9, async (_contexto, persistencia) => {
      await persistencia.mover([{ id: 100, bloqueId: 5 }, { id: 101, bloqueId: 6 }]);
    })).rejects.toMatchObject({ statusCode: 409 });
    const reservas = registro.sentencias.filter(sentencia => sentencia.sql.includes('from "bloques_reservados"'));
    expect(reservas).toHaveLength(2);
    expect(reservas.every(sentencia => sentencia.parametros.length === 1 && sentencia.parametros[0] === 3)).toBe(true);
    expect(registro.sentencias.every(sentencia => sentencia.sql.startsWith("select "))).toBe(true);
  });
  it("releases a room batch before applying final assignments", async () => {
    contextoVacio(); registro.respuestas.push([], [[100]], [[101]]);
    await resultadosHorariosRepository.conBloqueo(9, async (_contexto, persistencia) => {
      await persistencia.asignarSalas([{ id: 100, salaId: 5 }, { id: 101, salaId: 4 }]);
    });
    expect(registro.transaccion).toHaveBeenCalledOnce();
    expect(registro.sentencias.slice(-3).map(sentencia => sentencia.parametros)).toEqual([[null, 9, 100, 101], [5, 9, 100], [4, 9, 101]]);
  });
  it("propagates insertion failures through the transaction boundary", async () => {
    contextoVacio(); registro.respuestas.push([[100, 1, 4, 1, 1, 9], [101, 1, 4, 2, 1, 9]], [[9, 3, "2026-1", true, "propuesta"]], [], [], new Error("insert failed"));
    await expect(resultadosHorariosRepository.conBloqueo(9, async (_contexto, persistencia) => {
      await persistencia.mover([{ id: 100, bloqueId: 5 }, { id: 101, bloqueId: 6 }]);
    })).rejects.toMatchObject({ cause: { message: "insert failed" } });
  });
});
