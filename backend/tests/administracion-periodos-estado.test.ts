import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { administracionPeriodosRepository as repositorio } from "../src/repositories/administracion-periodos.repository.js";

// Independent-verifier regressions: inspect lock/check/write ordering without a database.
const contexto = vi.hoisted(() => ({ estado: "publicado", horarios: 1, eventos: [] as string[], campos: {} as Record<string, unknown> }));
vi.mock("../src/config/db.js", () => {
  const planificacion = () => ({ id: 7, carreraId: 2, codigo: "2026-2", actual: false, estadoPlanificacion: contexto.estado });
  const transaccion = {
    query: { planificacionesSemestres: { findFirst: async () => planificacion() } },
    select: () => ({ from: (tabla: Parameters<typeof getTableName>[0]) => {
      const nombre = getTableName(tabla);
      let parametros: unknown[] = [];
      const consulta = {
        where: (condicion: Parameters<PgDialect["sqlToQuery"]>[0]) => { parametros = new PgDialect().sqlToQuery(condicion).params; return consulta; },
        orderBy: () => consulta,
        innerJoin: () => consulta,
        for: async (modo: string) => {
          contexto.eventos.push(`${nombre}:${modo}`);
          if (nombre === "carreras") return [{ id: 2 }];
          if (nombre === "planificaciones_semestres") return [planificacion()];
          if (nombre === "carrera_departamento") return [{ carreraId: 2, departamentoId: 1, esGestionado: true }];
          if (nombre === "ofertas_asignaturas") { expect(parametros).toEqual([7]); return [{ id: 10, asignaturaCodigo: "INT", planificacionSemestreId: 7 }]; }
          if (nombre === "asignaturas") return [{ codigo: "INT", departamentoId: 1 }];
          if (nombre === "asignatura_tipo_hora") return [{ asignaturaCodigo: "INT", tipoHoraId: 1, horas: 1, tipo: "Teórica" }];
          if (nombre === "oferta_tipo_hora") return [];
          if (nombre === "horarios_asignaturas") {
            contexto.eventos.push("consulta-horarios"); expect(parametros).toEqual([7, 10]);
            return contexto.horarios ? [{ id: 90, ofertaId: 10, tipoHoraId: 1, bloqueId: 1, planificacionSemestreId: 7 }] : [];
          }
          throw new Error(`Unexpected read: ${nombre}`);
        },
      };
      return consulta;
    } }),
    update: () => ({ set: (campos: Record<string, unknown>) => {
      contexto.campos = campos;
      return { where: () => ({ returning: async () => { contexto.eventos.push("escritura"); return [{ ...planificacion(), ...campos }]; } }) };
    } }),
  };
  return { db: { transaction: async (ejecutar: (tx: typeof transaccion) => Promise<unknown>) => ejecutar(transaccion) } };
});
beforeEach(() => { contexto.estado = "publicado"; contexto.horarios = 1; contexto.eventos = []; contexto.campos = {}; });
it.each(["propuesta", "publicado"] as const)("rejects occupied return from %s after career and plan locks", async estadoAnterior => {
  contexto.estado = estadoAnterior;
  await expect(repositorio.cambiarEstado(7, { estadoAnterior, estadoPlanificacion: "preparacion" })).rejects.toMatchObject({ statusCode: 409 });
  expect(contexto.eventos.slice(0, 2)).toEqual(["carreras:update", "planificaciones_semestres:update"]);
  expect(contexto.eventos.indexOf("consulta-horarios")).toBeGreaterThan(1);
  expect(contexto.eventos).not.toContain("escritura");
  expect(contexto.campos).toEqual({});
});
it.each(["propuesta", "publicado"] as const)("admits empty return from %s without changing current markers", async estadoAnterior => {
  contexto.estado = estadoAnterior; contexto.horarios = 0;
  await repositorio.cambiarEstado(7, { estadoAnterior, estadoPlanificacion: "preparacion" });
  expect(contexto.eventos.slice(0, 2)).toEqual(["carreras:update", "planificaciones_semestres:update"]);
  expect(contexto.eventos.indexOf("escritura")).toBeGreaterThan(contexto.eventos.indexOf("consulta-horarios"));
  expect(contexto.campos).toEqual({ estadoPlanificacion: "preparacion" });
});
it("rejects stale state before querying schedules or writing", async () => {
  await expect(repositorio.cambiarEstado(7, { estadoAnterior: "propuesta", estadoPlanificacion: "preparacion" })).rejects.toMatchObject({ statusCode: 409 });
  expect(contexto.eventos).toEqual(["carreras:update", "planificaciones_semestres:update"]);
  expect(contexto.campos).toEqual({});
});
it.each(["propuesta", "publicado"] as const)("rejects %s with no managed schedules before any state write", async estadoPlanificacion => {
  contexto.estado = "preparacion"; contexto.horarios = 0;
  await expect(repositorio.cambiarEstado(7, { estadoAnterior: "preparacion", estadoPlanificacion })).rejects.toMatchObject({ statusCode: 409 });
  expect(contexto.eventos.slice(0, 2)).toEqual(["carreras:update", "planificaciones_semestres:update"]);
  expect(contexto.eventos).not.toContain("escritura"); expect(contexto.campos).toEqual({});
});
it.each(["propuesta", "publicado"] as const)("rechecks managed schedules after locking before admitting %s", async estadoPlanificacion => {
  contexto.estado = "preparacion"; contexto.horarios = 1;
  const registrar = contexto.eventos.push.bind(contexto.eventos);
  const observar = vi.spyOn(contexto.eventos, "push").mockImplementation((...eventos) => {
    if (eventos.includes("planificaciones_semestres:update")) contexto.horarios = 0;
    return registrar(...eventos);
  });
  try {
    await expect(repositorio.cambiarEstado(7, { estadoAnterior: "preparacion", estadoPlanificacion })).rejects.toMatchObject({
      statusCode: 409, message: "Para pasar a Propuesta o Publicado, el período debe tener horarios de asignaturas gestionadas",
    });
    expect(contexto.eventos).toContain("consulta-horarios");
    expect(contexto.eventos).not.toContain("escritura"); expect(contexto.campos).toEqual({});
  } finally { observar.mockRestore(); }
});
it.each([["publicado", "propuesta"], ["propuesta", "publicado"]] as const)("allows covered %s -> %s without applying the preparation-only blocker", async (estadoAnterior, estadoPlanificacion) => {
  contexto.estado = estadoAnterior;
  await repositorio.cambiarEstado(7, { estadoAnterior, estadoPlanificacion });
  expect(contexto.eventos).toContain("consulta-horarios");
  expect(contexto.campos).toEqual({ estadoPlanificacion });
});
