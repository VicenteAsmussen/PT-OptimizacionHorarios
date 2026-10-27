import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { getTableName } from "drizzle-orm";
import { administracionPeriodosRepository as repositorio } from "../src/repositories/administracion-periodos.repository.js";

// These independent-verifier regressions exercise fingerprint admission only.
// SQL filtering, actual deletes, concurrency and rollback are tested on isolated PostgreSQL.
const contexto = vi.hoisted(() => ({ filas: {} as Record<string, Record<string, unknown>[]>, escrituras: [] as string[] }));
vi.mock("../src/config/db.js", () => {
  const transaccion = {
    query: { planificacionesSemestres: { findFirst: async () => contexto.filas.planificaciones_semestres[0] } },
    select: () => ({ from: (tabla: Parameters<typeof getTableName>[0]) => {
      const consulta = { where: () => consulta, orderBy: () => consulta, innerJoin: () => consulta,
        for: async () => structuredClone(contexto.filas[getTableName(tabla)] ?? []) };
      return consulta;
    } }),
    delete: (tabla: Parameters<typeof getTableName>[0]) => ({ where: async () => { contexto.escrituras.push(getTableName(tabla)); } }),
  };
  return { db: { transaction: async (ejecutar: (tx: typeof transaccion) => Promise<unknown>) => ejecutar(transaccion) } };
});
const huellaDatos = () => createHash("sha256").update(JSON.stringify(contexto.filas)).digest("hex");
beforeEach(() => {
  contexto.escrituras = [];
  contexto.filas = {
    carreras: [{ id: 1, nombre: "Career A" }],
    planificaciones_semestres: [{ id: 1, carreraId: 1, codigo: "2026-2", actual: false, estadoPlanificacion: "publicado" }],
    carrera_departamento: [{ carreraId: 1, departamentoId: 1, esGestionado: true }],
    asignaturas: [{ codigo: "INT", departamentoId: 1 }],
    asignatura_tipo_hora: [{ asignaturaCodigo: "INT", tipoHoraId: 1, horas: 1, tipo: "Teórica" }],
    ofertas_asignaturas: [{ id: 10, planificacionSemestreId: 1, asignaturaCodigo: "INT", seccion: 1, cupos: 20 }],
    oferta_tipo_hora: [{ ofertaId: 10, tipoHoraId: 1, profesorId: 1 }],
    horarios_asignaturas: [{ id: 20, ofertaId: 10, tipoHoraId: 1, planificacionSemestreId: 1, salaId: 1, bloqueId: 1 }],
  };
});
it.each(["docente", "sala", "identidad", "carrera", "gestion", "confirmacion", "alcance"])("rejects stale %s without scheduling a write", async cambio => {
  const resumen = await repositorio.resumen(1, "gestionadas");
  if (cambio === "docente") contexto.filas.oferta_tipo_hora[0].profesorId = 2;
  if (cambio === "sala") contexto.filas.horarios_asignaturas[0].salaId = 2;
  if (cambio === "identidad") contexto.filas.ofertas_asignaturas[0].id = 11;
  if (cambio === "carrera") contexto.filas.carreras[0].nombre = "Renamed career";
  if (cambio === "gestion") contexto.filas.carrera_departamento[0].esGestionado = false;
  const antes = huellaDatos();
  await expect(repositorio.reiniciar(1, { objetivo: "ofertas", alcance: cambio === "alcance" ? "todas" : "gestionadas",
    confirmacion: cambio === "confirmacion" ? "2026-1" : "2026-2", huella: resumen.huella })).rejects.toMatchObject({ statusCode: 409 });
  expect(huellaDatos()).toBe(antes);
  expect(contexto.escrituras).toEqual([]);
});
it.each(["gestionadas", "todas"] as const)("schedule-only command never schedules offer/assignment deletion in %s", async alcance => {
  const resumen = await repositorio.resumen(1, alcance);
  expect(await repositorio.reiniciar(1, { objetivo: "horarios", alcance, confirmacion: "2026-2", huella: resumen.huella }))
    .toEqual({ ofertas: 0, asignaciones: 0, horarios: 1 });
  expect(contexto.escrituras).toEqual(["horarios_asignaturas"]);
});
