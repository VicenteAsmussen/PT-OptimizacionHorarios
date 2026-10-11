import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
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
const alcance = { carreraId: 1, asignaturasCodigos: ["LOCAL"], departamentosIds: [4], profesoresIds: [7], ofertasIds: [9] };
const dialecto = new PgDialect();
function consulta(llamada: unknown) {
  return dialecto.sqlToQuery((llamada as { where: SQL }).where);
}
beforeEach(() => vi.clearAllMocks());
it("compone filtros SQL de alcance con los filtros del cliente", async () => {
  await asignaturasRepository.findAll(alcance);
  await profesoresRepository.findAll(4, alcance);
  await ofertasRepository.findAll({ semestreId: 3, asignaturaCodigo: "OTRA" }, alcance);
  await horariosRepository.findAll({ semestreId: 3, ofertaId: 10 }, alcance);
  await carrerasRepository.findAll(alcance);
  await departamentosRepository.findAll(alcance);
  await disponibilidadRepository.findAll({ profesorId: 8 }, alcance);
  expect(consulta(vi.mocked(db.query.asignaturas.findMany).mock.calls[0]![0]).params).toEqual(["LOCAL"]);
  const profesores = consulta(vi.mocked(db.query.profesores.findMany).mock.calls[0]![0]);
  expect(profesores.params).toEqual([4, 4]);
  expect(profesores.sql).toContain(" and ");
  expect(consulta(vi.mocked(db.query.ofertasAsignaturas.findMany).mock.calls[0]![0]).params).toEqual(["LOCAL", 3, "OTRA"]);
  expect(consulta(vi.mocked(db.query.horariosAsignaturas.findMany).mock.calls[0]![0]).params).toEqual([9, 3, 10]);
  expect(consulta(vi.mocked(db.query.carreras.findMany).mock.calls[0]![0]).params).toEqual([1]);
  expect(consulta(vi.mocked(db.query.departamentos.findMany).mock.calls[0]![0]).params).toEqual([4]);
  expect(consulta(vi.mocked(db.query.disponibilidadProfesores.findMany).mock.calls[0]![0]).params).toEqual([7, 8]);
});
it("alcance vacío produce false, no consulta global", async () => {
  const vacio = { ...alcance, asignaturasCodigos: [], departamentosIds: [], profesoresIds: [], ofertasIds: [] };
  await asignaturasRepository.findAll(vacio);
  await profesoresRepository.findAll(undefined, vacio);
  await ofertasRepository.findAll(undefined, vacio);
  await horariosRepository.findAll(undefined, vacio);
  await departamentosRepository.findAll(vacio);
  await disponibilidadRepository.findAll(undefined, vacio);
  for (const repositorio of [db.query.asignaturas, db.query.profesores, db.query.ofertasAsignaturas,
    db.query.horariosAsignaturas, db.query.departamentos, db.query.disponibilidadProfesores]) {
    expect(consulta(vi.mocked(repositorio.findMany).mock.calls[0]![0]).sql).toContain("false");
  }
});
it("admin sin alcance conserva consulta global", async () => {
  await asignaturasRepository.findAll();
  await profesoresRepository.findAll();
  await ofertasRepository.findAll();
  await horariosRepository.findAll();
  await carrerasRepository.findAll();
  await departamentosRepository.findAll();
  await disponibilidadRepository.findAll();
  for (const repositorio of [db.query.asignaturas, db.query.profesores, db.query.ofertasAsignaturas,
    db.query.horariosAsignaturas, db.query.carreras, db.query.departamentos, db.query.disponibilidadProfesores]) {
    expect(vi.mocked(repositorio.findMany).mock.calls[0]![0]).toMatchObject({ where: undefined });
  }
});
it("filtra también las ofertas anidadas del profesor", async () => {
  await profesoresRepository.findById(7, alcance);
  const llamada = vi.mocked(db.query.profesores.findFirst).mock.calls[0]![0] as unknown as { with: { ofertas: { where: SQL } } };
  expect(dialecto.sqlToQuery(llamada.with.ofertas.where).params).toEqual(["LOCAL"]);
});
it("resuelve relaciones de la carrera autenticada sin filtrar esGestionado", async () => {
  const condiciones: SQL[] = [];
  const resultados = [[{ carreraId: 1 }], [{ codigo: "LOCAL" }], [{ id: 4 }], [{ id: 7 }], [{ id: 9 }]];
  vi.mocked(db.select).mockImplementation(() => {
    const filas = resultados.shift();
    return { from: () => ({ where: (condicion: SQL) => {
      condiciones.push(condicion);
      return condiciones.length === 1 ? { limit: async () => filas } : Promise.resolve(filas);
    } }) } as never;
  });
  expect(await carrerasRepository.findAlcanceByUsuarioId(42)).toEqual(alcance);
  expect(condiciones.map((condicion) => dialecto.sqlToQuery(condicion).params)).toEqual([[42], [1], [1], [4], ["LOCAL"]]);
  expect(dialecto.sqlToQuery(condiciones[2]!).sql).not.toContain("es_gestionado");
});
it("sin perfil no genera un alcance global", async () => {
  vi.mocked(db.select).mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) } as never);
  expect(await carrerasRepository.findAlcanceByUsuarioId(42)).toBeUndefined();
});
