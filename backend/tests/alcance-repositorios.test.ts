import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";
import { db } from "../src/config/db.js";
import { asignaturasRepository } from "../src/repositories/asignaturas.repository.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { ofertasRepository } from "../src/repositories/ofertas.repository.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { carrerasRepository } from "../src/repositories/carreras.repository.js";
import { departamentosRepository } from "../src/repositories/departamentos.repository.js";
import { disponibilidadRepository } from "../src/repositories/disponibilidad.repository.js";
vi.mock("../src/config/db.js", () => ({ db: { select: vi.fn(), query: {
  asignaturas: { findMany: vi.fn() }, profesores: { findMany: vi.fn(), findFirst: vi.fn() },
  ofertasAsignaturas: { findMany: vi.fn() }, horariosAsignaturas: { findMany: vi.fn() },
  carreras: { findMany: vi.fn() }, departamentos: { findMany: vi.fn() }, disponibilidadProfesores: { findMany: vi.fn() },
} } }));
const alcance = { carreraId: 1, asignaturasCodigos: ["LOCAL"], departamentosIds: [4], departamentosGestionadosIds: [4], profesoresIds: [7], ofertasIds: [9] };
const dialecto = new PgDialect();
const constructor = drizzle(async () => { throw new Error("No se ejecuta SQL en pruebas de alcance"); });
function consulta(llamada: unknown) { return dialecto.sqlToQuery((llamada as { where: SQL }).where); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockImplementation(constructor.select.bind(constructor) as typeof db.select);
});
it("compone carrera de planificación con filtros del cliente", async () => {
  await asignaturasRepository.findAll(alcance);
  await profesoresRepository.findAll(4, alcance);
  await ofertasRepository.findAll({ planificacionSemestreId: 3, asignaturaCodigo: "OTRA" }, alcance);
  await horariosRepository.findAll({ planificacionSemestreId: 3, ofertaId: 10 }, alcance);
  await carrerasRepository.findAll(alcance);
  await departamentosRepository.findAll(alcance);
  await disponibilidadRepository.findAll({ profesorId: 8 }, alcance);
  expect(consulta(vi.mocked(db.query.asignaturas.findMany).mock.calls[0]![0]).params).toEqual(["LOCAL"]);
  expect(consulta(vi.mocked(db.query.profesores.findMany).mock.calls[0]![0]).params).toEqual([4, 4]);
  expect(consulta(vi.mocked(db.query.ofertasAsignaturas.findMany).mock.calls[0]![0]).params).toEqual([1, 3, "OTRA"]);
  expect(consulta(vi.mocked(db.query.horariosAsignaturas.findMany).mock.calls[0]![0]).params).toEqual([1, 3, 10]);
  expect(consulta(vi.mocked(db.query.carreras.findMany).mock.calls[0]![0]).params).toEqual([1]);
  expect(consulta(vi.mocked(db.query.departamentos.findMany).mock.calls[0]![0]).params).toEqual([4]);
  expect(consulta(vi.mocked(db.query.disponibilidadProfesores.findMany).mock.calls[0]![0]).params).toEqual([1, 8]);
});
it("catálogo vacío no amplía a otras carreras las entidades de planificación", async () => {
  const vacio = { ...alcance, asignaturasCodigos: [], departamentosIds: [], profesoresIds: [], ofertasIds: [] };
  await asignaturasRepository.findAll(vacio);
  await profesoresRepository.findAll(undefined, vacio);
  await ofertasRepository.findAll(undefined, vacio);
  await horariosRepository.findAll(undefined, vacio);
  await departamentosRepository.findAll(vacio);
  await disponibilidadRepository.findAll(undefined, vacio);
  for (const repositorio of [db.query.asignaturas, db.query.profesores, db.query.departamentos]) expect(consulta(vi.mocked(repositorio.findMany).mock.calls[0]![0]).sql).toContain("false");
  for (const repositorio of [db.query.ofertasAsignaturas, db.query.horariosAsignaturas, db.query.disponibilidadProfesores]) {
    const condicion = consulta(vi.mocked(repositorio.findMany).mock.calls[0]![0]);
    expect(condicion.sql).toContain('"carrera_id" =');
    expect(condicion.params).toEqual([1]);
  }
});
it("admin sin alcance conserva consulta global", async () => {
  await asignaturasRepository.findAll(); await profesoresRepository.findAll(); await ofertasRepository.findAll();
  await horariosRepository.findAll(); await carrerasRepository.findAll(); await departamentosRepository.findAll(); await disponibilidadRepository.findAll();
  for (const repositorio of [db.query.asignaturas, db.query.profesores, db.query.ofertasAsignaturas, db.query.horariosAsignaturas, db.query.carreras, db.query.departamentos, db.query.disponibilidadProfesores]) expect(vi.mocked(repositorio.findMany).mock.calls[0]![0]).toMatchObject({ where: undefined });
});
it.each(["findById", "findAll"] as const)("%s filtra ofertas y disponibilidad anidadas por carrera, no por código compartido", async metodo => {
  if (metodo === "findById") await profesoresRepository.findById(7, alcance);
  else await profesoresRepository.findAll(undefined, alcance);
  const llamada = (metodo === "findById" ? vi.mocked(db.query.profesores.findFirst).mock.calls[0]![0] : vi.mocked(db.query.profesores.findMany).mock.calls[0]![0]) as unknown as { with: { ofertas: { where: SQL }; disponibilidades: { where: SQL } } };
  for (const relacion of [llamada.with.ofertas, llamada.with.disponibilidades]) {
    const consulta = dialecto.sqlToQuery(relacion.where);
    expect(consulta.sql).toContain("planificaciones_semestres"); expect(consulta.sql).toContain("carrera_id"); expect(consulta.params).toEqual([1]);
  }
});
it("resuelve ofertas por planificación de carrera y conserva departamentos externos", async () => {
  const condiciones: SQL[] = [];
  const resultados = [[{ carreraId: 1 }], [{ codigo: "LOCAL" }], [{ id: 4, esGestionado: true }, { id: 5, esGestionado: false }], [{ id: 7 }], [{ id: 9 }]];
  vi.mocked(db.select).mockImplementation(() => {
    const filas = resultados.shift();
    const cadena = { innerJoin: () => cadena, where: (condicion: SQL) => {
      condiciones.push(condicion);
      return condiciones.length === 1 ? { limit: async () => filas } : Promise.resolve(filas);
    } };
    return { from: () => cadena } as never;
  });
  expect(await carrerasRepository.findAlcanceByUsuarioId(42)).toEqual({ ...alcance, departamentosIds: [4, 5] });
  expect(condiciones.map(condicion => dialecto.sqlToQuery(condicion).params)).toEqual([[42], [1], [1], [4, 5], [1]]);
  expect(dialecto.sqlToQuery(condiciones[2]!).sql).not.toContain("es_gestionado");
});
it("sin perfil no genera alcance global", async () => {
  vi.mocked(db.select).mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) } as never);
  expect(await carrerasRepository.findAlcanceByUsuarioId(42)).toBeUndefined();
});
