import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { ofertasRepository } from "../src/repositories/ofertas.repository.js";
import { disponibilidadRepository } from "../src/repositories/disponibilidad.repository.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { planificacionesSemestresRepository } from "../src/repositories/planificaciones-semestres.repository.js";
import { exigirPlanificacionEditable } from "../src/repositories/planificacion-escritura.js";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { planificacionesSemestresRouter } from "../src/routes/planificaciones-semestres.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: Request, _res: Response, next: NextFunction) => {
  req.user = { id: 5, rol: "admin" } as Request["user"];
  next();
} }));
const app = express();
app.use(express.json());
app.use("/api/planificaciones-semestres", planificacionesSemestresRouter);
app.use(errorHandler);

const contexto = vi.hoisted(() => ({ base: {} as Record<string, unknown> }));
vi.mock("../src/config/db.js", () => ({ db: new Proxy({}, { get: (_, clave) => contexto.base[String(clave)] }) }));
type Fila = Record<string, unknown>;
const dialecto = new PgDialect();
let tablas: Record<string, Fila[]>;
let eventos: string[];
let alBloquear: (() => void) | undefined;
let alEscribir: ((tabla: string, operacion: string) => void) | undefined;
let consultas: { tabla: string; parametros: unknown[]; eventosPrevios: string[] }[];
function parametros(condicion?: SQL): unknown[] { return condicion ? dialecto.sqlToQuery(condicion).params : []; }
function buscar(tabla: string, condicion?: SQL) {
  const valores = parametros(condicion);
  const sql = condicion ? dialecto.sqlToQuery(condicion).sql : "";
  const comparaciones = [...sql.matchAll(/"(\w+)"\s*=\s*\$(\d+)/g)];
  return tablas[tabla].filter(fila => comparaciones.every(([, columna, indice]) => {
    const campo = columna.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
    return fila[campo] === valores[Number(indice) - 1];
  }) && [...sql.matchAll(/"(\w+)"\s*<>\s*\$(\d+)/g)].every(([, columna, indice]) => {
    const campo = columna.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
    return fila[campo] !== valores[Number(indice) - 1];
  }));
}
function baseSimulada() {
  const base: Record<string, unknown> = {};
  base.select = () => ({ from: (tabla: never) => {
    const nombre = getTableName(tabla);
    let condicion: SQL | undefined;
    let unida = false;
    const resultados = () => {
      consultas.push({ tabla: nombre, parametros: parametros(condicion), eventosPrevios: [...eventos] });
      if (!unida) return buscar(nombre, condicion);
      const originales = tablas[nombre];
      tablas[nombre] = originales.map(fila => ({ ...fila, ...tablas.oferta_tipo_hora.find(a => a.ofertaId === fila.ofertaId && a.tipoHoraId === fila.tipoHoraId), id: fila.id }));
      try { return buscar(nombre, condicion); } finally { tablas[nombre] = originales; }
    };
    const cadena = {
      innerJoin: () => { unida = true; return cadena; },
      where: (valor: SQL) => { condicion = valor; return cadena; },
      limit: async () => resultados(),
      for: async () => {
        eventos.push(`bloqueo:${nombre}:${parametros(condicion).join(",")}`);
        if (nombre === "carreras") { const accion = alBloquear; alBloquear = undefined; accion?.(); }
        return buscar(nombre, condicion);
      },
      then: (resolver: (filas: Fila[]) => unknown) => Promise.resolve(resultados()).then(resolver),
    };
    return cadena;
  } });
  const nombres = { ofertaTipoHora: "oferta_tipo_hora", asignaturaTipoHora: "asignatura_tipo_hora", planificacionesSemestres: "planificaciones_semestres", ofertasAsignaturas: "ofertas_asignaturas", horariosAsignaturas: "horarios_asignaturas", disponibilidadProfesores: "disponibilidad_profesores", carreraDepartamento: "carrera_departamento", carreraAsignatura: "carrera_asignatura", asignaturas: "asignaturas", profesores: "profesores" };
  base.query = Object.fromEntries(Object.entries(nombres).map(([clave, nombre]) => [clave, {
    findFirst: async ({ where }: { where: SQL }) => {
      eventos.push(`lectura:${nombre}`);
      return buscar(nombre, where)[0];
    },
    findMany: async ({ where }: { where?: SQL } = {}) => buscar(nombre, where),
  }]));
  for (const operacion of ["insert", "update", "delete"]) base[operacion] = (tabla: never) => {
    const nombre = getTableName(tabla);
    let datos: Fila = {};
    let actualizacionConflicto: Fila | undefined;
    let condicion: SQL | undefined;
    const ejecutar = async () => {
      eventos.push(`escritura:${nombre}:${operacion}`);
      alEscribir?.(nombre, operacion);
      const afectadas = buscar(nombre, condicion);
      const siguienteId = Math.max(9, ...tablas[nombre].map(fila => Number(fila.id) || 0)) + 1;
      const filas = operacion === "insert" ? (Array.isArray(datos) ? datos : [datos]).map((fila, indice) => ({ id: siguienteId + indice, ...fila })) : afectadas;
      if (operacion === "insert") for (const fila of filas) {
        const existente = actualizacionConflicto && tablas[nombre].find(a => a.ofertaId === fila.ofertaId && a.tipoHoraId === fila.tipoHoraId);
        if (existente) Object.assign(existente, actualizacionConflicto); else tablas[nombre].push(fila);
      }
      if (operacion === "update") afectadas.forEach(fila => Object.assign(fila, datos));
      if (operacion === "delete") {
        tablas[nombre] = tablas[nombre].filter(fila => !afectadas.includes(fila));
        // Model the existing availability FK cascade, not an application delete.
        if (nombre === "planificaciones_semestres") tablas.disponibilidad_profesores = tablas.disponibilidad_profesores.filter(fila => !afectadas.some(periodo => periodo.id === fila.planificacionSemestreId));
      }
      return filas;
    };
    const cadena = { values: (valor: Fila) => { datos = valor; return cadena; }, set: (valor: Fila) => { datos = valor; return cadena; }, where: (valor: SQL) => { condicion = valor; return cadena; },
      onConflictDoUpdate: ({ set }: { set: Fila }) => { actualizacionConflicto = set; return cadena; },
      returning: ejecutar, then: (resolver: (filas: Fila[]) => unknown, rechazar: (error: unknown) => unknown) => ejecutar().then(resolver, rechazar) };
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
  alEscribir = undefined;
  consultas = [];
  tablas = {
    carreras: [{ id: 1 }, { id: 2 }],
    planificaciones_semestres: [
      { id: 1, carreraId: 2, codigo: "2026-2", actual: true, estadoPlanificacion: "preparacion" },
      { id: 2, carreraId: 1, codigo: "2026-1", actual: true, estadoPlanificacion: "preparacion" },
    ],
    ofertas_asignaturas: [{ id: 10, asignaturaCodigo: "INF100", planificacionSemestreId: 1 }],
    oferta_tipo_hora: [{ ofertaId: 10, tipoHoraId: 1, profesorId: 7 }],
    asignatura_tipo_hora: [{ asignaturaCodigo: "INF100", tipoHoraId: 1, horas: 4 }],
    horarios_asignaturas: [{ id: 20, ofertaId: 10, tipoHoraId: 1, bloqueId: 2, salaId: null, planificacionSemestreId: 1 }],
    disponibilidad_profesores: [{ id: 30, planificacionSemestreId: 1 }],
    carrera_departamento: [{ carreraId: 2, departamentoId: 4, esGestionado: false }],
    carrera_asignatura: [{ carreraId: 2, asignaturaCodigo: "MAT100" }, { carreraId: 2, asignaturaCodigo: "MAT200" }],
    asignaturas: [{ codigo: "MAT100", departamentoId: 4, semestreMalla: 2 }, { codigo: "MAT200", departamentoId: 4, semestreMalla: 3 }, { codigo: "OTRA", departamentoId: 5, semestreMalla: 2 }],
    profesores: [{ id: 7, departamentoId: 4 }],
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
const oferta = { asignaturaCodigo: "INF100", asignaciones: [], profesorId: 7, seccion: 1, cupos: 30, planificacionSemestreId: 1 };
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
  ["reemplazar externos", () => horariosRepository.sincronizarExternosEnTransaccion(1, 4, [{ ...oferta, asignaturaCodigo: "MAT100", sesiones: [{ bloqueId: 1, tipoHoraId: 1 }] }], 2)],
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
it.each(["preparacion", "propuesta", "publicado"])("actual-only %s conserva datos y aísla carrera", async estadoPlanificacion => {
  Object.assign(tablas.planificaciones_semestres[0], { actual: false, estadoPlanificacion });
  tablas.planificaciones_semestres.push({ id: 3, carreraId: 2, codigo: "2027-1", actual: true, estadoPlanificacion: "publicado" });
  const anteriores = structuredClone(tablas);
  await planificacionesSemestresRepository.update(1, 2, { actual: true });
  expect(tablas).toEqual({ ...anteriores, planificaciones_semestres: anteriores.planificaciones_semestres.map(fila => fila.carreraId === 2 ? { ...fila, actual: fila.id === 1 } : fila) });
  expect(eventos.slice(0, 3)).toEqual(["inicio", "bloqueo:carreras:2", "bloqueo:planificaciones_semestres:1,2"]);
});
it.each(["preparacion", "propuesta", "publicado"])("desmarcar actual %s no elige reemplazo", async estadoPlanificacion => {
  tablas.planificaciones_semestres[0].estadoPlanificacion = estadoPlanificacion;
  const anteriores = structuredClone(tablas);
  await planificacionesSemestresRepository.update(1, 2, { actual: false });
  expect(tablas).toEqual({ ...anteriores, planificaciones_semestres: [{ ...anteriores.planificaciones_semestres[0], actual: false }, anteriores.planificaciones_semestres[1]] });
});
it("actual-only revalida bajo bloqueo y revierte las desactivaciones si falla la última escritura", async () => {
  const anteriores = structuredClone(tablas); let escrituras = 0;
  alBloquear = () => { tablas.planificaciones_semestres[0].estadoPlanificacion = "publicado"; };
  alEscribir = () => { if (++escrituras === 2) throw new Error("fallo al marcar actual"); };
  await expect(planificacionesSemestresRepository.update(1, 2, { actual: true })).rejects.toThrow("fallo al marcar actual");
  expect(tablas).toEqual(anteriores); expect(eventos.at(-1)).toBe("rollback");
});
it.each([true, false])("DELETE preparación actual=%s permite disponibilidad y no activa reemplazo", async actual => {
  tablas.ofertas_asignaturas = []; tablas.horarios_asignaturas = [];
  tablas.planificaciones_semestres[0].actual = actual;
  tablas.planificaciones_semestres.push({ id: 3, carreraId: 2, codigo: "2027-1", actual: false, estadoPlanificacion: "publicado" });
  const anteriores = structuredClone(tablas);
  expect(await planificacionesSemestresRepository.delete(1, 2, "2026-2")).toEqual(anteriores.planificaciones_semestres[0]);
  expect(tablas).toEqual({ ...anteriores, planificaciones_semestres: anteriores.planificaciones_semestres.slice(1), disponibilidad_profesores: [] });
  expect(eventos).toEqual(["inicio", "bloqueo:carreras:2", "bloqueo:planificaciones_semestres:1,2", "escritura:planificaciones_semestres:delete", "commit"]);
});
it.each(["oferta externa", "oferta gestionada", "oferta sin relación", "propuesta", "publicado", "código", "id", "carrera"])("DELETE rechaza %s y conserva todas las tablas", async caso => {
  if (!caso.startsWith("oferta")) { tablas.ofertas_asignaturas = []; tablas.horarios_asignaturas = []; }
  if (caso === "oferta gestionada") tablas.carrera_departamento[0].esGestionado = true;
  if (caso === "oferta sin relación") tablas.carrera_departamento = [];
  if (["propuesta", "publicado"].includes(caso)) tablas.planificaciones_semestres[0].estadoPlanificacion = caso;
  const anteriores = structuredClone(tablas);
  await expect(planificacionesSemestresRepository.delete(caso === "id" ? 404 : 1, caso === "carrera" ? 1 : 2, caso === "código" ? " 2026-2" : "2026-2")).rejects.toMatchObject({ statusCode: ["id", "carrera"].includes(caso) ? 404 : 409 });
  expect(tablas).toEqual(anteriores);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
  expect(eventos.at(-1)).toBe("rollback");
});
it.each(["estado", "código", "oferta", "desaparición", "carrera"])("DELETE relee %s después de esperar carrera", async caso => {
  tablas.ofertas_asignaturas = []; tablas.horarios_asignaturas = [];
  alBloquear = () => {
    if (caso === "estado") tablas.planificaciones_semestres[0].estadoPlanificacion = "publicado";
    if (caso === "código") tablas.planificaciones_semestres[0].codigo = "2028-1";
    if (caso === "oferta") tablas.ofertas_asignaturas.push({ id: 40, planificacionSemestreId: 1 });
    if (caso === "desaparición") tablas.planificaciones_semestres.shift();
    if (caso === "carrera") tablas.planificaciones_semestres[0].carreraId = 1;
  };
  await expect(planificacionesSemestresRepository.delete(1, 2, "2026-2")).rejects.toMatchObject({ statusCode: ["desaparición", "carrera"].includes(caso) ? 404 : 409 });
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
it("DELETE revierte un fallo tardío sin limpiar ofertas/horarios ni cambiar actual", async () => {
  tablas.ofertas_asignaturas = []; tablas.horarios_asignaturas = [];
  const anteriores = structuredClone(tablas);
  alEscribir = () => { throw new Error("fallo de eliminación"); };
  await expect(planificacionesSemestresRepository.delete(1, 2, "2026-2")).rejects.toThrow("fallo de eliminación");
  expect(tablas).toEqual(anteriores); expect(eventos.at(-1)).toBe("rollback");
});
it.each(["preparacion", "propuesta", "publicado"])("crear período conserva anterior %s y los datos de todas las carreras", async estadoPlanificacion => {
  tablas.planificaciones_semestres[0].estadoPlanificacion = estadoPlanificacion;
  const anteriores = structuredClone(tablas);
  const creada = await planificacionesSemestresRepository.create({ carreraId: 2, codigo: "2027-1" });
  expect(creada).toMatchObject({ carreraId: 2, codigo: "2027-1", actual: true, estadoPlanificacion: "preparacion" });
  expect(tablas).toEqual({ ...anteriores, planificaciones_semestres: [
    { ...anteriores.planificaciones_semestres[0], actual: false }, anteriores.planificaciones_semestres[1], creada,
  ] });
  expect(eventos).toEqual(["inicio", "bloqueo:carreras:2", "escritura:planificaciones_semestres:update", "escritura:planificaciones_semestres:insert", "commit"]);
});
it("crea el primer período sin afectar carreras que ya tienen uno actual", async () => {
  tablas.carreras.push({ id: 3 });
  const anteriores = structuredClone(tablas);
  const creada = await planificacionesSemestresRepository.create({ carreraId: 3, codigo: "2026-2" });
  expect(creada).toMatchObject({ carreraId: 3, codigo: "2026-2", actual: true, estadoPlanificacion: "preparacion" });
  expect(tablas).toEqual({ ...anteriores, planificaciones_semestres: [...anteriores.planificaciones_semestres, creada] });
});
describe("creation HTTP through the real service/repository and simulated storage", () => {
  function simularUnicidadSinNombre() {
    alEscribir = (tabla, operacion) => {
      if (tabla === "planificaciones_semestres" && operacion === "insert" && tablas[tabla].some(fila => fila.carreraId === 2 && fila.codigo === "2026-2")) {
        // Model an opaque driver constraint error, not evidence of the live driver.
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
    };
  }
  it.each(["preparacion", "propuesta", "publicado"])("duplicate %s returns exact 409 before any writes", async estadoPlanificacion => {
    Object.assign(tablas.planificaciones_semestres[0], { actual: false, estadoPlanificacion });
    tablas.planificaciones_semestres.push({ id: 3, carreraId: 2, codigo: "2027-1", actual: true, estadoPlanificacion: "preparacion" });
    const anteriores = structuredClone(tablas);
    const lectura = await request(app).get("/api/planificaciones-semestres");
    simularUnicidadSinNombre();
    const respuesta = await request(app).post("/api/planificaciones-semestres").send({ carreraId: 2, codigo: "2026-2" });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 409, message: "Período existente" });
    expect((await request(app).get("/api/planificaciones-semestres")).body).toEqual(lectura.body);
    expect(tablas).toEqual(anteriores);
    expect(eventos).toEqual(["inicio", "bloqueo:carreras:2", "rollback"]);
    expect(consultas).toEqual([{ tabla: "planificaciones_semestres", parametros: [2, "2026-2"], eventosPrevios: ["inicio", "bloqueo:carreras:2"] }]);
  });
  it("reads duplicates committed while waiting for the career lock, before demoting current", async () => {
    alBloquear = () => { tablas.planificaciones_semestres.push({ id: 3, carreraId: 2, codigo: "2027-1", actual: false, estadoPlanificacion: "publicado" }); };
    const respuesta = await request(app).post("/api/planificaciones-semestres").send({ carreraId: 2, codigo: "2027-1" });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 409, message: "Período existente" });
    expect(eventos).toEqual(["inicio", "bloqueo:carreras:2", "rollback"]);
    expect(consultas).toEqual([{ tabla: "planificaciones_semestres", parametros: [2, "2027-1"], eventosPrevios: ["inicio", "bloqueo:carreras:2"] }]);
  });
  it("same code in another career still creates and preserves all unrelated data", async () => {
    const anteriores = structuredClone(tablas);
    const respuesta = await request(app).post("/api/planificaciones-semestres").send({ carreraId: 1, codigo: "2026-2" });
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ status: "success", data: { id: 10, carreraId: 1, codigo: "2026-2", actual: true, estadoPlanificacion: "preparacion" } });
    expect(tablas).toEqual({ ...anteriores, planificaciones_semestres: [anteriores.planificaciones_semestres[0], { ...anteriores.planificaciones_semestres[1], actual: false }, respuesta.body.data] });
    expect(consultas).toEqual([{ tabla: "planificaciones_semestres", parametros: [1, "2026-2"], eventosPrevios: ["inicio", "bloqueo:carreras:1"] }]);
    expect((await request(app).get("/api/planificaciones-semestres")).body.data).toEqual(tablas.planificaciones_semestres);
  });
  it("unrelated insertion failure stays 500 and rolls back current flags/data", async () => {
    const anteriores = structuredClone(tablas);
    const lectura = await request(app).get("/api/planificaciones-semestres");
    alEscribir = (_tabla, operacion) => { if (operacion === "insert") throw new Error("storage unavailable"); };
    const respuesta = await request(app).post("/api/planificaciones-semestres").send({ carreraId: 2, codigo: "2027-1" });
    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 500, message: "Internal server error" });
    expect((await request(app).get("/api/planificaciones-semestres")).body).toEqual(lectura.body);
    expect(tablas).toEqual(anteriores);
    expect(eventos.at(-1)).toBe("rollback");
  });
});
it("un fallo tardío de inserción revierte la desactivación anterior en la transacción simulada", async () => {
  const anteriores = structuredClone(tablas);
  const error = Object.assign(new Error("duplicate"), { code: "23505", constraint: "planificaciones_semestres_carrera_codigo_unique" });
  alEscribir = (tabla, operacion) => {
    if (tabla === "planificaciones_semestres" && operacion === "insert") {
      expect(tablas.planificaciones_semestres[0].actual).toBe(false);
      throw error;
    }
  };
  await expect(planificacionesSemestresRepository.create({ carreraId: 2, codigo: "2027-1" })).rejects.toBe(error);
  expect(tablas).toEqual(anteriores);
  expect(eventos.at(-1)).toBe("rollback");
});
it("carrera inexistente no altera tablas en la transacción simulada", async () => {
  const anteriores = structuredClone(tablas);
  await expect(planificacionesSemestresRepository.create({ carreraId: 404, codigo: "2027-1" })).rejects.toMatchObject({ statusCode: 404 });
  expect(tablas).toEqual(anteriores);
  expect(eventos).toEqual(["inicio", "bloqueo:carreras:404", "rollback"]);
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

function prepararReemplazo() {
  tablas.ofertas_asignaturas = [
    { id: 10, planificacionSemestreId: 1, asignaturaCodigo: "MAT100", seccion: 1, cupos: 20 },
    { id: 11, planificacionSemestreId: 1, asignaturaCodigo: "MAT100", seccion: 2, cupos: 20 },
    { id: 12, planificacionSemestreId: 1, asignaturaCodigo: "MAT200", seccion: 1, cupos: 20 },
    { id: 13, planificacionSemestreId: 1, asignaturaCodigo: "OTRA", seccion: 1 },
    { id: 14, planificacionSemestreId: 2, asignaturaCodigo: "MAT100", seccion: 1 },
  ];
  tablas.oferta_tipo_hora = tablas.ofertas_asignaturas.map(oferta => ({ ofertaId: oferta.id, tipoHoraId: 1, profesorId: oferta.id === 13 ? 8 : 7 }));
  tablas.horarios_asignaturas = tablas.ofertas_asignaturas.map(oferta => ({ id: Number(oferta.id) + 20, ofertaId: oferta.id, tipoHoraId: 1, planificacionSemestreId: oferta.planificacionSemestreId, bloqueId: 1 }));
}
const filasReemplazo = () => [{ asignaturaCodigo: "MAT100", seccion: 1, profesorId: 7, cupos: 45, sesiones: [{ bloqueId: 1, tipoHoraId: 1 }] }];
it("sincroniza el departamento completo preservando IDs y otros ámbitos, y admite reimportación", async () => {
  prepararReemplazo();
  const ajenas = structuredClone(tablas.ofertas_asignaturas.slice(3));
  const horariosAjenos = structuredClone(tablas.horarios_asignaturas.slice(3));
  expect(await horariosRepository.sincronizarExternosEnTransaccion(1, 4, filasReemplazo(), 2)).toEqual({ ofertasCreadas: 0, ofertasActualizadas: 1, ofertasEliminadas: 2 });
  expect(tablas.ofertas_asignaturas).toEqual([{ id: 10, planificacionSemestreId: 1, asignaturaCodigo: "MAT100", seccion: 1, cupos: 45 }, ...ajenas]);
  expect(tablas.oferta_tipo_hora.find(fila => fila.ofertaId === 10)).toMatchObject({ tipoHoraId: 1, profesorId: 7 });
  expect(tablas.horarios_asignaturas.filter(fila => fila.ofertaId !== 10)).toEqual(horariosAjenos);
  expect(tablas.horarios_asignaturas.filter(fila => fila.ofertaId === 10)).toEqual([expect.objectContaining({ bloqueId: 1, salaId: null })]);
  expect(await horariosRepository.sincronizarExternosEnTransaccion(1, 4, filasReemplazo(), 2)).toEqual({ ofertasCreadas: 0, ofertasActualizadas: 1, ofertasEliminadas: 0 });
  expect(tablas.ofertas_asignaturas).toHaveLength(3);
  expect(tablas.horarios_asignaturas).toHaveLength(3);
});
it("crea secciones nuevas y actualiza docente, cupos y sesiones", async () => {
  prepararReemplazo(); tablas.profesores.push({ id: 9, departamentoId: 4 });
  const filas = filasReemplazo(); filas[0]!.profesorId = 9; filas[0]!.sesiones[0]!.bloqueId = 2;
  filas.push({ ...filas[0]!, seccion: 3, sesiones: [{ bloqueId: 3, tipoHoraId: 1 }] });
  expect(await horariosRepository.sincronizarExternosEnTransaccion(1, 4, filas, 2)).toEqual({ ofertasCreadas: 1, ofertasActualizadas: 1, ofertasEliminadas: 2 });
  expect(tablas.ofertas_asignaturas.find(fila => fila.id === 10)).toMatchObject({ cupos: 45 });
  expect(tablas.oferta_tipo_hora.find(fila => fila.ofertaId === 10)).toMatchObject({ profesorId: 9 });
  expect(tablas.horarios_asignaturas.find(fila => fila.ofertaId === 10)).toMatchObject({ bloqueId: 2 });
});
it("revierte eliminaciones y actualizaciones si falla la escritura final de sesiones", async () => {
  prepararReemplazo(); const anteriores = structuredClone(tablas);
  alEscribir = (tabla, operacion) => { if (tabla === "horarios_asignaturas" && operacion === "insert") throw new Error("fallo simulado"); };
  await expect(horariosRepository.sincronizarExternosEnTransaccion(1, 4, filasReemplazo(), 2)).rejects.toThrow("fallo simulado");
  expect(eventos).toContain("escritura:ofertas_asignaturas:delete");
  expect(eventos).toContain("escritura:ofertas_asignaturas:update");
  expect(tablas).toEqual(anteriores);
});
it.each(["carrera", "departamento", "malla", "profesor", "ocupacion", "vacio", "cobertura"])("revalida %s sin modificar datos", async caso => {
  prepararReemplazo();
  if (caso === "departamento") tablas.carrera_departamento[0]!.esGestionado = true;
  if (caso === "malla") tablas.carrera_asignatura = [];
  if (caso === "profesor") tablas.profesores = [];
  if (caso === "ocupacion") tablas.oferta_tipo_hora[3]!.profesorId = 7;
  if (caso === "cobertura") tablas.asignaturas[1]!.semestreMalla = 4;
  const anteriores = structuredClone(tablas);
  await expect(horariosRepository.sincronizarExternosEnTransaccion(1, 4, caso === "vacio" ? [] : filasReemplazo(), caso === "carrera" ? 99 : 2)).rejects.toThrow();
  expect(tablas).toEqual(anteriores);
  expect(eventos.some(evento => evento.startsWith("escritura:"))).toBe(false);
});
