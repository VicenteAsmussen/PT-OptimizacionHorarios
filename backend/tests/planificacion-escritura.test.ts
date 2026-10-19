import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { ofertasRepository } from "../src/repositories/ofertas.repository.js";
import { disponibilidadRepository } from "../src/repositories/disponibilidad.repository.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { planificacionesSemestresRepository } from "../src/repositories/planificaciones-semestres.repository.js";
import { exigirPlanificacionEditable } from "../src/repositories/planificacion-escritura.js";

const contexto = vi.hoisted(() => ({ base: {} as Record<string, unknown> }));
vi.mock("../src/config/db.js", () => ({ db: new Proxy({}, { get: (_, clave) => contexto.base[String(clave)] }) }));
type Fila = Record<string, unknown>;
const dialecto = new PgDialect();
let tablas: Record<string, Fila[]>;
let eventos: string[];
let alBloquear: (() => void) | undefined;
function parametros(condicion?: SQL): unknown[] { return condicion ? dialecto.sqlToQuery(condicion).params : []; }
function buscar(tabla: string, condicion?: SQL) {
  const valores = parametros(condicion);
  const sql = condicion ? dialecto.sqlToQuery(condicion).sql : "";
  const comparaciones = [...sql.matchAll(/"(\w+)"\s*=\s*\$(\d+)/g)];
  return tablas[tabla].filter(fila => comparaciones.every(([, columna, indice]) => {
    const campo = columna.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
    return fila[campo] === valores[Number(indice) - 1];
  }));
}
function baseSimulada() {
  const base: Record<string, unknown> = {};
  base.select = () => ({ from: (tabla: never) => {
    const nombre = getTableName(tabla);
    let condicion: SQL | undefined;
    const cadena = {
      where: (valor: SQL) => { condicion = valor; return cadena; },
      limit: async () => buscar(nombre, condicion),
      for: async () => {
        eventos.push(`bloqueo:${nombre}:${parametros(condicion).join(",")}`);
        if (nombre === "carreras") { const accion = alBloquear; alBloquear = undefined; accion?.(); }
        return buscar(nombre, condicion);
      },
      then: (resolver: (filas: Fila[]) => unknown) => Promise.resolve(buscar(nombre, condicion)).then(resolver),
    };
    return cadena;
  } });
  const nombres = { planificacionesSemestres: "planificaciones_semestres", ofertasAsignaturas: "ofertas_asignaturas", horariosAsignaturas: "horarios_asignaturas", disponibilidadProfesores: "disponibilidad_profesores" };
  base.query = Object.fromEntries(Object.entries(nombres).map(([clave, nombre]) => [clave, {
    findFirst: async ({ where }: { where: SQL }) => {
      eventos.push(`lectura:${nombre}`);
      return buscar(nombre, where)[0];
    },
    findMany: async () => tablas[nombre],
  }]));
  for (const operacion of ["insert", "update", "delete"]) base[operacion] = (tabla: never) => {
    const nombre = getTableName(tabla);
    let datos: Fila = {};
    const ejecutar = async () => {
      eventos.push(`escritura:${nombre}:${operacion}`);
      const filas = (Array.isArray(datos) ? datos : [datos]).map(fila => ({ id: 10, ...fila }));
      if (operacion === "insert") tablas[nombre].push(...filas);
      return filas;
    };
    const cadena = { values: (valor: Fila) => { datos = valor; return cadena; }, set: (valor: Fila) => { datos = valor; return cadena; }, where: () => cadena,
      returning: ejecutar, then: (resolver: (filas: Fila[]) => unknown) => ejecutar().then(resolver) };
    return cadena;
  };
  base.execute = async () => { eventos.push("bloqueo-global"); };
  base.transaction = async (accion: (tx: unknown) => Promise<unknown>) => {
    eventos.push("inicio");
    const anteriores = structuredClone(tablas);
    try { const resultado = await accion(base); eventos.push("commit"); return resultado; }
    catch (error) { tablas = anteriores; eventos.push("rollback"); throw error; }
  };
  return base;
}
beforeEach(() => {
  eventos = [];
  alBloquear = undefined;
  tablas = {
    carreras: [{ id: 1 }, { id: 2 }],
    planificaciones_semestres: [
      { id: 1, carreraId: 2, actual: true, estadoPlanificacion: "preparacion" },
      { id: 2, carreraId: 1, actual: true, estadoPlanificacion: "preparacion" },
    ],
    ofertas_asignaturas: [{ id: 10, planificacionSemestreId: 1 }],
    horarios_asignaturas: [{ id: 20, ofertaId: 10, planificacionSemestreId: 1 }],
    disponibilidad_profesores: [{ id: 30, planificacionSemestreId: 1 }],
  };
  contexto.base = baseSimulada();
});
it.each([
  [true, "preparacion", true], [false, "preparacion", false],
  [true, "propuesta", false], [false, "propuesta", false],
  [true, "publicado", false], [false, "publicado", false],
] as const)("helper actual=%s estado=%s permite=%s", (actual, estadoPlanificacion, permitido) => {
  const validar = () => exigirPlanificacionEditable({ actual, estadoPlanificacion });
  if (permitido) expect(validar).not.toThrow();
  else expect(validar).toThrow(/actual en preparación/);
});
const oferta = { asignaturaCodigo: "INF100", profesorId: 7, seccion: 1, cupos: 30, planificacionSemestreId: 1 };
const horario = { ofertaId: 10, bloqueId: 1, tipoHoraId: 1, salaId: null, planificacionSemestreId: 1 };
const mutaciones = [
  ["crear oferta", () => ofertasRepository.create(oferta)],
  ["actualizar oferta", () => ofertasRepository.update(10, { cupos: 40 })],
  ["eliminar oferta", () => ofertasRepository.delete(10)],
  ["crear disponibilidad", () => disponibilidadRepository.create({ profesorId: 7, bloqueId: 1, planificacionSemestreId: 1 })],
  ["sincronizar disponibilidad", () => disponibilidadRepository.syncDisponibilidad(7, 1, [1, 2])],
  ["vaciar disponibilidad", () => disponibilidadRepository.syncDisponibilidad(7, 1, [])],
  ["eliminar disponibilidad", () => disponibilidadRepository.delete(30)],
  ["limpiar disponibilidad", () => disponibilidadRepository.deleteByProfesorAndPlanificacion(7, 1)],
  ["crear horario", () => horariosRepository.create(horario)],
  ["actualizar horario", () => horariosRepository.update(20, { salaId: 2 })],
  ["eliminar horario", () => horariosRepository.delete(20)],
  ["eliminar horarios de oferta", () => horariosRepository.deleteByOferta(10)],
  ["importar externos", () => horariosRepository.crearExternosEnTransaccion(1, [{ ...oferta, sesiones: [{ bloqueId: 1, tipoHoraId: 1 }] }])],
  ["importar salas", () => horariosRepository.actualizarSalasEnTransaccion(1, [{ id: 20, salaId: 2 }])],
] as const;
describe.each([
  [true, "propuesta"], [true, "publicado"], [false, "preparacion"], [false, "propuesta"], [false, "publicado"],
])("rechazo actual=%s estado=%s", (actual, estadoPlanificacion) => {
  it.each(mutaciones)("%s rechaza antes de escribir", async (_, mutar) => {
    Object.assign(tablas.planificaciones_semestres[0], { actual, estadoPlanificacion });
    await expect(mutar()).rejects.toThrow(/planificaci[oó]n/i);
    expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
    expect(eventos.at(-1)).toBe("rollback");
  });
});
it.each(mutaciones.filter(([nombre]) => nombre !== "eliminar oferta" && nombre !== "importar externos"))("%s permite preparación actual bajo bloqueo", async (_, mutar) => {
  await mutar();
  const bloqueo = eventos.findIndex(evento => evento.startsWith("bloqueo:carreras"));
  const escritura = eventos.findIndex(evento => evento.startsWith("escritura:"));
  expect(bloqueo).toBeGreaterThan(0);
  expect(escritura).toBeGreaterThan(bloqueo);
  expect(eventos.at(-1)).toBe("commit");
});
it.each(["origen", "destino"])("rechaza mover oferta con %s congelado", async lado => {
  tablas.planificaciones_semestres[lado === "origen" ? 0 : 1].estadoPlanificacion = "publicado";
  await expect(ofertasRepository.update(10, { planificacionSemestreId: 2 })).rejects.toThrow(/planificaci[oó]n/i);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it.each(["origen", "destino"])("rechaza mover horario con %s congelado", async lado => {
  tablas.ofertas_asignaturas.push({ id: 11, planificacionSemestreId: 2 });
  tablas.planificaciones_semestres[lado === "origen" ? 0 : 1].estadoPlanificacion = "propuesta";
  await expect(horariosRepository.update(20, { ofertaId: 11, planificacionSemestreId: 2 })).rejects.toThrow(/planificaci[oó]n/i);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("ordena carreras y planificaciones, y relee origen después de bloquear", async () => {
  await ofertasRepository.update(10, { planificacionSemestreId: 2 });
  expect(eventos.filter(evento => evento.startsWith("bloqueo:"))).toEqual([
    "bloqueo:carreras:1", "bloqueo:carreras:2", "bloqueo:planificaciones_semestres:1", "bloqueo:planificaciones_semestres:2",
  ]);
  expect(eventos.filter(evento => evento === "lectura:ofertas_asignaturas")).toHaveLength(2);
});
it.each(["oferta", "horario", "disponibilidad"])("aborta si cambia el vínculo de %s mientras espera el bloqueo", async entidad => {
  const nombre = { oferta: "ofertas_asignaturas", horario: "horarios_asignaturas", disponibilidad: "disponibilidad_profesores" }[entidad]!;
  alBloquear = () => { tablas[nombre][0].planificacionSemestreId = 2; };
  const mutar = entidad === "oferta" ? () => ofertasRepository.update(10, { cupos: 40 }) : entidad === "horario" ? () => horariosRepository.delete(20) : () => disponibilidadRepository.delete(30);
  await expect(mutar()).rejects.toThrow(/cambi[oó]/i);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("relee el vínculo de la oferta destino del horario", async () => {
  alBloquear = () => { tablas.ofertas_asignaturas[0].planificacionSemestreId = 2; };
  await expect(horariosRepository.create(horario)).rejects.toThrow(/cambi[oó]/i);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it.each(["propuesta", "publicado"])("metadatos rechazan %s observado bajo bloqueo", async estado => {
  alBloquear = () => { tablas.planificaciones_semestres[0].estadoPlanificacion = estado; };
  await expect(planificacionesSemestresRepository.update(1, 2, { codigo: "2027-1", actual: true })).rejects.toThrow(/planificaci[oó]n/i);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("permite seleccionar como actual una preparación histórica", async () => {
  tablas.planificaciones_semestres[0].actual = false;
  await planificacionesSemestresRepository.update(1, 2, { actual: true });
  expect(eventos.at(-1)).toBe("commit");
});
it("Excel externo no cambia estado ni usa bloqueo global", async () => {
  tablas.ofertas_asignaturas = [];
  await horariosRepository.crearExternosEnTransaccion(1, [{ ...oferta, sesiones: [{ bloqueId: 1, tipoHoraId: 1 }] }]);
  expect(eventos).not.toContain("escritura:planificaciones_semestres:update");
  expect(eventos).not.toContain("bloqueo-global");
  expect(eventos).toContain("escritura:horarios_asignaturas:insert");
});
it("conserva rechazo de eliminación de oferta con horarios", async () => {
  await expect(ofertasRepository.delete(10)).rejects.toThrow(/horarios asociados/);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("permite eliminar oferta sin dependencias", async () => {
  tablas.horarios_asignaturas = [];
  await ofertasRepository.delete(10);
  expect(eventos).toContain("escritura:ofertas_asignaturas:delete");
});
it.each(["oferta", "horario", "horarios de oferta"])("rechaza %s cuyo origen cambió después de autorizar en servicio", async entidad => {
  const mutar = entidad === "oferta" ? () => ofertasRepository.update(10, { cupos: 40 }, 2)
    : entidad === "horario" ? () => horariosRepository.delete(20, 2) : () => horariosRepository.deleteByOferta(10, 2);
  await expect(mutar()).rejects.toThrow(/cambió/);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it.each(["origen", "destino"])("rechaza mover oferta desde/hacia %s histórico", async lado => {
  tablas.planificaciones_semestres[lado === "origen" ? 0 : 1].actual = false;
  await expect(ofertasRepository.update(10, { planificacionSemestreId: 2 })).rejects.toThrow(/planificación/);
});
it.each(["origen", "destino"])("rechaza mover horario desde/hacia %s histórico", async lado => {
  tablas.ofertas_asignaturas.push({ id: 11, planificacionSemestreId: 2 });
  tablas.planificaciones_semestres[lado === "origen" ? 0 : 1].actual = false;
  await expect(horariosRepository.update(20, { ofertaId: 11, planificacionSemestreId: 2 })).rejects.toThrow(/planificación/);
});
it("revalida actual después de esperar el bloqueo", async () => {
  alBloquear = () => { tablas.planificaciones_semestres[0].actual = false; };
  await expect(ofertasRepository.create(oferta)).rejects.toThrow(/planificación/);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("rechaza planificación inexistente", async () => {
  await expect(ofertasRepository.create({ ...oferta, planificacionSemestreId: 404 })).rejects.toMatchObject({ statusCode: 404 });
});
it("rechaza horario y oferta de planificaciones diferentes bajo bloqueo", async () => {
  await expect(horariosRepository.create({ ...horario, planificacionSemestreId: 2 })).rejects.toThrow(/no coincide/);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("revisa todo el lote de salas antes de escribir si una entrada está congelada", async () => {
  tablas.horarios_asignaturas.push({ id: 21, ofertaId: 11, planificacionSemestreId: 2 });
  tablas.planificaciones_semestres[1].estadoPlanificacion = "publicado";
  await expect(horariosRepository.actualizarSalasEnTransaccion(1, [{ id: 20, salaId: 2 }, { id: 21, salaId: 2 }])).rejects.toThrow(/planificación/);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("propaga un conflicto tardío de Excel y revierte el lote en la transacción simulada", async () => {
  tablas.ofertas_asignaturas = [];
  const anteriores = structuredClone(tablas);
  const fila = { ...oferta, sesiones: [{ bloqueId: 1, tipoHoraId: 1 }] };
  await expect(horariosRepository.crearExternosEnTransaccion(1, [fila, fila])).rejects.toThrow(/oferta ya existe/);
  expect(eventos).toContain("escritura:ofertas_asignaturas:insert");
  expect(eventos.at(-1)).toBe("rollback");
  expect(tablas).toEqual(anteriores);
});
