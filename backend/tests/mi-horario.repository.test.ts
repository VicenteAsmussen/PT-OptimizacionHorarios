import { beforeEach, expect, it, vi } from "vitest";

const { consultas } = vi.hoisted(() => ({ consultas: [] as { sql: string; parametros: unknown[] }[] }));
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("../src/db/schema/index.js");
  return { db: drizzle(async (sql, parametros) => {
    consultas.push({ sql, parametros });
    return { rows: [] };
  }, { schema }) };
});
import { miHorarioRepository } from "../src/repositories/mi-horario.repository.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
beforeEach(() => { consultas.length = 0; });

it("deriva planificaciones por asignaciones docentes y estado, sin restringir departamento ni período actual", async () => {
  await miHorarioRepository.findPlanificaciones(7);
  const consulta = consultas[0];
  expect(consulta.sql).toContain('inner join "oferta_tipo_hora"');
  expect(consulta.sql).toContain('"profesor_id" =');
  expect(consulta.sql).toContain('"estado_planificacion" in');
  expect(consulta.sql).not.toContain('carrera_departamento');
  expect(consulta.sql).not.toMatch(/"actual"\s*=/);
  // Relational loading also binds LIMIT 1 for the career relation.
  expect(consulta.parametros.slice(-4)).toEqual(["preparacion", "propuesta", "publicado", 7]);
});

it("mantiene el aislamiento de clases por oferta y tipo para dos profesores de una sección", async () => {
  await horariosRepository.findAll({ profesorId: 8, planificacionSemestreId: 10 });
  const consulta = consultas[0];
  expect(consulta.sql).toContain('"oferta_tipo_hora"."oferta_id" = "horarios_asignaturas"."oferta_id"');
  expect(consulta.sql).toContain('"oferta_tipo_hora"."tipo_hora_id" = "horarios_asignaturas"."tipo_hora_id"');
  expect(consulta.sql).toContain('"oferta_tipo_hora"."profesor_id" =');
  expect(consulta.parametros.slice(-2)).toEqual([10, 8]);
});
