import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Motor relacional mínimo en memoria, nunca importa la conexión PostgreSQL.
const memoria = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]>, escrituras: 0,
  bloqueos: [] as string[], trasBloqueo: undefined as undefined | ((tabla: string) => void) }));
vi.mock("drizzle-orm", async importar => {
  const original = await importar<typeof import("drizzle-orm")>();
  return { ...original,
    eq: (columna: unknown, valor: unknown) => ({ columna, valor, operador: "igual" }),
    inArray: (columna: unknown, valor: unknown[]) => ({ columna, valor, operador: "en" }),
    and: (...condiciones: unknown[]) => ({ condiciones }),
  };
});
vi.mock("../src/config/db.js", async () => {
  const { getTableName, getTableColumns } = await import("drizzle-orm");
  const esquema = await import("../src/db/schema/index.js");
  const tablas = Object.values(esquema).filter(valor => {
    try { return !!getTableName(valor as never); } catch { return false; }
  });
  function cumple(fila: Record<string, unknown>, condicion: any): boolean {
    if (!condicion) return true;
    if (condicion.condiciones) return condicion.condiciones.every((parte: unknown) => cumple(fila, parte));
    const columnas = getTableColumns(condicion.columna.table);
    const campo = Object.keys(columnas).find(clave => columnas[clave] === condicion.columna)!;
    return condicion.operador === "en" ? condicion.valor.includes(fila[campo]) : fila[campo] === condicion.valor;
  }
  const consulta = Object.fromEntries(Object.entries(esquema).filter(([, valor]) => tablas.includes(valor)).map(([clave, tabla]) => [clave, {
    findMany: async (opciones: any = {}) => (memoria.tablas[getTableName(tabla as never)] ?? []).filter(fila => cumple(fila, opciones.where)),
    findFirst: async (opciones: any = {}) => (memoria.tablas[getTableName(tabla as never)] ?? []).find(fila => cumple(fila, opciones.where)),
  }]));
  function operacion(tabla?: any, accion?: string) {
    let condicion: unknown;
    let cambios: Record<string, unknown> = {};
    const ejecutar = () => {
      const nombre = getTableName(tabla);
      const filas = memoria.tablas[nombre] ?? [];
      const elegidas = filas.filter(fila => cumple(fila, condicion));
      if (accion) {
        memoria.escrituras++;
        if (accion === "eliminar") memoria.tablas[nombre] = filas.filter(fila => !elegidas.includes(fila));
        if (accion === "actualizar") elegidas.forEach(fila => Object.assign(fila, cambios));
        if (accion === "crear") {
          const creada = { id: filas.length + 1, ...cambios };
          memoria.tablas[nombre] = [...filas, creada];
          return [creada];
        }
      }
      return elegidas;
    };
    const cadena: any = {
      from: (origen: any) => { tabla = origen; return cadena; },
      innerJoin: () => cadena,
      where: (filtro: unknown) => { condicion = filtro; return cadena; },
      orderBy: () => cadena,
      limit: () => cadena,
      for: () => {
        const nombre = getTableName(tabla);
        memoria.bloqueos.push(nombre);
        memoria.trasBloqueo?.(nombre);
        return cadena;
      },
      set: (datos: Record<string, unknown>) => { cambios = datos; return cadena; },
      values: (datos: Record<string, unknown>) => { cambios = datos; return cadena; },
      returning: () => Promise.resolve(ejecutar()),
      then: (resolver: any, rechazar: any) => Promise.resolve().then(ejecutar).then(resolver, rechazar),
    };
    return cadena;
  }
  const conexion: any = { query: consulta, select: () => operacion(), update: (tabla: any) => operacion(tabla, "actualizar"),
    delete: (tabla: any) => operacion(tabla, "eliminar"), insert: (tabla: any) => operacion(tabla, "crear") };
  conexion.transaction = async (escribir: any) => escribir(conexion);
  return { db: conexion };
});
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (peticion: any, _respuesta: any, siguiente: any) => {
  peticion.user = { id: 1, rol: peticion.header("x-rol") ?? "admin" }; siguiente();
} }));

import { salasRouter } from "../src/routes/salas.routes.js";
import { asignaturasRouter } from "../src/routes/asignaturas.routes.js";
import { carrerasRouter } from "../src/routes/carreras.routes.js";
import { departamentosRouter } from "../src/routes/departamentos.routes.js";
import { profesoresRouter } from "../src/routes/profesores.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/salas", salasRouter);
aplicacion.use("/asignaturas", asignaturasRouter);
aplicacion.use("/carreras", carrerasRouter);
aplicacion.use("/departamentos", departamentosRouter);
aplicacion.use("/profesores", profesoresRouter);
aplicacion.use(errorHandler);

beforeEach(() => {
  memoria.escrituras = 0;
  memoria.bloqueos = [];
  memoria.trasBloqueo = undefined;
  memoria.tablas = {
    salas: [{ id: 1, nombre: "Sala inicial", capacidad: 30, tipo: "Sala" }],
    carreras: [{ id: 1, nombre: "Carrera inicial" }],
    departamentos: [{ id: 1, nombre: "Departamento inicial" }],
    asignaturas: [{ codigo: "INF100", nombre: "Asignatura inicial", departamentoId: 1, semestreMalla: 1 }],
    profesores: [{ id: 7, nombre: "Profesor inicial", departamentoId: 1, tipo: "planta", usuarioId: null }],
    planificaciones_semestres: [{ id: 1, carreraId: 1 }],
  };
});

describe("catálogos institucionales mediante HTTP y persistencia simulada", () => {
  it.each(["post", "put", "delete"] as const)("secretaría no puede %s salas físicas antes de llegar al repositorio", async metodo => {
    const antes = JSON.stringify(memoria.tablas);
    const respuesta = await request(aplicacion)[metodo](metodo === "post" ? "/salas" : "/salas/1")
      .set("x-rol", "secretaria").send({ nombre: "Otra sala", capacidad: 40, tipo: "Sala" });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 403, message: "Acceso denegado: Se requiere uno de los roles [admin], tu rol actual es 'secretaria'" });
    expect(memoria.escrituras).toBe(0);
    expect(memoria.bloqueos).toEqual([]);
    expect(JSON.stringify(memoria.tablas)).toBe(antes);
  });
  it("secretaría conserva la consulta de salas", async () => {
    const respuesta = await request(aplicacion).get("/salas").set("x-rol", "secretaria");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data[0].nombre).toBe("Sala inicial");
    expect(memoria.escrituras).toBe(0);
  });

  const catalogos = [
    { ruta: "/salas/1", tabla: "salas", cambios: { nombre: "Sala libre", capacidad: 40, tipo: "Sala" } },
    { ruta: "/asignaturas/INF100", tabla: "asignaturas", cambios: { nombre: "Asignatura libre" } },
    { ruta: "/carreras/1", tabla: "carreras", cambios: { nombre: "Carrera libre" } },
    { ruta: "/departamentos/1", tabla: "departamentos", cambios: { nombre: "Departamento libre" } },
  ];
  it.each([
    { ruta: "/salas", tabla: "salas", datos: { nombre: "Sala nueva", capacidad: 20, tipo: "Sala" } },
    { ruta: "/asignaturas", tabla: "asignaturas", datos: { codigo: "NUEVA", nombre: "Materia nueva", departamentoId: 1, semestreMalla: 2 } },
    { ruta: "/carreras", tabla: "carreras", datos: { nombre: "Carrera nueva" } },
    { ruta: "/departamentos", tabla: "departamentos", datos: { nombre: "Departamento nuevo" } },
  ])("admin conserva creación en $ruta", async ({ ruta, tabla, datos }) => {
    const respuesta = await request(aplicacion).post(ruta).send(datos);
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ status: "success", data: datos });
    expect(memoria.tablas[tabla]).toHaveLength(2);
    expect(memoria.escrituras).toBe(1);
  });
  for (const catalogo of catalogos) {
    for (const metodo of ["put", "delete"] as const) {
      it(`${metodo} ${catalogo.ruta} rechaza dependencia académica directa o transitiva sin mutar`, async () => {
        memoria.tablas.carrera_asignatura = [{ carreraId: 1, asignaturaCodigo: "INF100" }];
        memoria.tablas.ofertas_asignaturas = [{ id: 2, asignaturaCodigo: "INF100", planificacionSemestreId: 1 }];
        memoria.tablas.horarios_asignaturas = [{ id: 3, ofertaId: 2, salaId: 1, planificacionSemestreId: 1 }];
        const antes = JSON.stringify(memoria.tablas);
        const respuesta = await request(aplicacion)[metodo](catalogo.ruta).send(catalogo.cambios);
        expect(respuesta.status).toBe(409);
        expect(respuesta.body).toEqual({ status: "error", statusCode: 409, message: catalogo.tabla === "departamentos" && metodo === "delete"
          ? "No se puede eliminar el departamento porque tiene asignaturas asociadas"
          : "El registro tiene dependencias académicas y solo se puede consultar" });
        expect(memoria.escrituras).toBe(0);
        expect(JSON.stringify(memoria.tablas)).toBe(antes);
      });
      it(`${metodo} ${catalogo.ruta} conserva modificación y borrado del registro libre`, async () => {
        if (catalogo.tabla === "departamentos") memoria.tablas.asignaturas = [];
        const respuesta = await request(aplicacion)[metodo](catalogo.ruta).send(catalogo.cambios);
        expect(respuesta.status).toBe(metodo === "put" ? 200 : 204);
        expect(memoria.escrituras).toBeGreaterThan(0);
        if (metodo === "put") expect(memoria.tablas[catalogo.tabla][0].nombre).toBe(catalogo.cambios.nombre);
        else expect(memoria.tablas[catalogo.tabla]).toEqual([]);
      });
    }
  }
  it.each(["carreras", "departamentos"])("%s protege disponibilidad transitiva incluso sin ofertas ni horarios", async catalogo => {
    memoria.tablas.carrera_departamento = [{ carreraId: 1, departamentoId: 1 }];
    memoria.tablas.disponibilidad_profesores = [{ profesorId: 7, planificacionSemestreId: 1 }];
    const antes = JSON.stringify(memoria.tablas);
    for (const metodo of ["put", "delete"] as const) {
      const respuesta = await request(aplicacion)[metodo](`/${catalogo}/1`).send({ nombre: "Cambio" });
      expect(respuesta.status).toBe(409);
    }
    expect(memoria.escrituras).toBe(0);
    expect(JSON.stringify(memoria.tablas)).toBe(antes);
  });
  it.each(["put", "delete"] as const)("carrera protege %s de malla con oferta en otra carrera histórica", async metodo => {
    memoria.tablas.carrera_asignatura = [{ carreraId: 1, asignaturaCodigo: "INF100" }];
    memoria.tablas.ofertas_asignaturas = [{ id: 2, asignaturaCodigo: "INF100", planificacionSemestreId: 99 }];
    memoria.tablas.planificaciones_semestres.push({ id: 99, carreraId: 2, actual: false });
    const antes = JSON.stringify(memoria.tablas);
    const respuesta = await request(aplicacion)[metodo]("/carreras/1").send({ nombre: "Cambio" });
    expect(respuesta.status).toBe(409);
    expect(memoria.escrituras).toBe(0);
    expect(JSON.stringify(memoria.tablas)).toBe(antes);
  });
  it("la guarda vuelve a comprobar el uso después del bloqueo, sin confiar en la lectura para UI", async () => {
    memoria.trasBloqueo = tabla => {
      if (tabla === "asignaturas") memoria.tablas.ofertas_asignaturas = [{ id: 2, asignaturaCodigo: "INF100", planificacionSemestreId: 1 }];
    };
    const respuesta = await request(aplicacion).put("/asignaturas/INF100").send({ nombre: "Cambio" });
    expect(respuesta.status).toBe(409);
    expect(memoria.bloqueos).toEqual(["carreras", "planificaciones_semestres", "asignaturas"]);
    expect(memoria.escrituras).toBe(0);
    expect(memoria.tablas.asignaturas[0].nombre).toBe("Asignatura inicial");
    expect(memoria.tablas.ofertas_asignaturas).toHaveLength(1);
  });
  it("la lectura de asignaturas informa el uso histórico sin exponer las dependencias", async () => {
    memoria.tablas.ofertas_asignaturas = [{ id: 2, asignaturaCodigo: "INF100", planificacionSemestreId: 99 }];
    const respuesta = await request(aplicacion).get("/asignaturas/INF100");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.tieneDependenciasAcademicas).toBe(true);
    expect(respuesta.body.data).not.toHaveProperty("ofertas");
    expect(memoria.escrituras).toBe(0);
  });
  it("dependencias ajenas no bloquean una asignatura libre", async () => {
    memoria.tablas.ofertas_asignaturas = [{ id: 2, asignaturaCodigo: "OTRA", planificacionSemestreId: 1 }];
    const respuesta = await request(aplicacion).put("/asignaturas/INF100").send({ nombre: "Cambio libre" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toMatchObject({ nombre: "Cambio libre", tieneDependenciasAcademicas: false });
  });
  it.each(["disponibilidad_profesores", "oferta_tipo_hora"])("admin no puede borrar un perfil con %s y conserva los datos y cuentas", async tabla => {
    memoria.tablas[tabla] = [{ profesorId: 7, planificacionSemestreId: 1 }];
    memoria.tablas.profesores[0].usuarioId = 8;
    memoria.tablas.usuarios = [{ id: 8, nombre: "Cuenta sintética", rol: "profesor" }];
    const antes = JSON.stringify(memoria.tablas);
    const respuesta = await request(aplicacion).delete("/profesores/7");
    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 409,
      message: "No se puede eliminar el profesor porque tiene dependencias académicas. Puedes quitar su acceso al sistema." });
    expect(memoria.escrituras).toBe(0);
    expect(JSON.stringify(memoria.tablas)).toBe(antes);
  });
  it("admin conserva edición institucional de un profesor de planta con disponibilidad", async () => {
    memoria.tablas.disponibilidad_profesores = [{ profesorId: 7, planificacionSemestreId: 1 }];
    const respuesta = await request(aplicacion).put("/profesores/7").send({ nombre: "Identidad actualizada" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toMatchObject({ nombre: "Identidad actualizada", tipo: "planta", tieneDependenciasAcademicas: true });
    expect(memoria.tablas.disponibilidad_profesores).toEqual([{ profesorId: 7, planificacionSemestreId: 1 }]);
    expect(memoria.escrituras).toBe(1);
  });
  it("admin conserva borrar un perfil libre sin limpiar datos académicos", async () => {
    const respuesta = await request(aplicacion).delete("/profesores/7");
    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe("");
    expect(memoria.tablas.profesores).toEqual([]);
    expect(memoria.escrituras).toBe(1);
  });
});
