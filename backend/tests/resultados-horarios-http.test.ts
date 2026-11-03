import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import ExcelJS from "exceljs";
import { encabezadosExcelSalas } from "../src/utils/excel-salas.js";

const datos = vi.hoisted(() => ({ contexto: {} as any, fallo: false, escrituras: 0, cambiosSalas: [] as { id: number; salaId: number | null }[] }));
vi.mock("../src/repositories/resultados-horarios.repository.js", () => ({ resultadosHorariosRepository: {
  leer: vi.fn(async () => structuredClone(datos.contexto)),
  conBloqueo: vi.fn(async (_id: number, operar: any) => {
    const copia = structuredClone(datos.contexto);
    const persistencia = {
      mover: async (cambios: { id: number; bloqueId: number }[]) => {
        datos.escrituras++;
        for (const cambio of cambios) {
          const entrada = copia.entradas.find((fila: any) => fila.id === cambio.id);
          entrada.bloqueId = cambio.bloqueId;
          entrada.bloque = copia.bloques.find((bloque: any) => bloque.id === cambio.bloqueId);
        }
        if (datos.fallo) throw new Error("Simulated persistence failure");
      },
      asignarSalas: async (cambios: { id: number; salaId: number | null }[]) => {
        datos.escrituras++;
        datos.cambiosSalas.push(...structuredClone(cambios));
        for (const cambio of cambios) copia.entradas.find((fila: any) => fila.id === cambio.id).salaId = cambio.salaId;
      },
      publicar: async () => { copia.planificacion.estadoPlanificacion = "publicado"; },
    };
    const respuesta = await operar(copia, persistencia);
    datos.contexto = copia;
    return respuesta;
  }),
} }));
vi.mock("../src/utils/alcance-carrera.js", () => ({ resolverAlcanceCarrera: async () => ({ carreraId: 3 }) }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: any, _res: any, siguiente: any) => {
  if (!req.headers.authorization) return siguiente(new UnauthorizedError("Unauthenticated"));
  req.user = { id: 1, rol: req.headers.authorization }; siguiente();
} }));
vi.mock("../src/config/db.js", () => ({ db: {} }));
import { UnauthorizedError } from "../src/utils/errors.js";
import { resultadosHorariosRouter } from "../src/routes/resultados-horarios.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

const aplicacion = express();
aplicacion.use(express.json());
aplicacion.use("/api/resultados-horarios", resultadosHorariosRouter);
aplicacion.use(errorHandler);
const ruta = "/api/resultados-horarios/9";
const consultar = (consulta = "") => request(aplicacion).get(ruta + consulta).set("Authorization", "secretaria");
const bloques = Array.from({ length: 8 }, (_, indice) => ({ id: indice + 1, dia: "Lunes", numeroBloque: indice + 1,
  horaInicio: ["08:10", "08:50", "09:40", "10:20", "11:10", "11:50", "12:40", "13:20"][indice],
  horaTermino: ["08:50", "09:30", "10:20", "11:00", "11:50", "12:30", "13:20", "14:00"][indice] }));
function oferta(id = 1, nivel = 1, departamentoId = 5, requiereSala = true) {
  return { id, planificacionSemestreId: 9, seccion: 1, cupos: 30, asignaturaCodigo: `AS${id}`,
    asignatura: { codigo: `AS${id}`, nombre: `Subject ${id}`, departamentoId, semestreMalla: nivel, requiereSala,
      tiposHora: [{ tipoHoraId: 1, horas: 2, tipoHora: { id: 1, tipo: "Teórica" } }] } };
}
function entradas(ofertaActual: any, numeros = [1, 2], profesorId = 7, salaId: number | null = 4) {
  return numeros.map((bloqueId, indice) => ({ id: ofertaActual.id * 100 + indice, ofertaId: ofertaActual.id, tipoHoraId: 1,
    bloqueId, salaId, planificacionSemestreId: 9, oferta: ofertaActual, bloque: bloques[bloqueId - 1], tipoHora: { id: 1, tipo: "Teórica" },
    asignacion: { profesorId, profesor: { id: profesorId, nombre: "Professor" } }, sala: salaId ? { id: salaId, nombre: "101-AA" } : null }));
}
beforeEach(() => {
  const actual = oferta();
  datos.contexto = { planificacion: { id: 9, carreraId: 3, codigo: "2026-1", actual: true, estadoPlanificacion: "propuesta" },
    entradas: entradas(actual), ofertas: [actual], asignaturasMalla: [actual.asignatura], departamentosGestionadosIds: [5], bloques,
    salas: [{ id: 4, nombre: "101-AA" }, { id: 5, nombre: "102-AA" }],
    disponibilidades: bloques.map(bloque => ({ profesorId: 7, bloqueId: bloque.id, planificacionSemestreId: 9 })) };
  datos.fallo = false;
  datos.escrituras = 0;
  datos.cambiosSalas = [];
});
async function movimiento(idsHorarios = [100, 101], bloqueInicioId = 5, sufijo = "movimientos") {
  const lectura = await consultar();
  return request(aplicacion).post(`${ruta}/${sufijo}`).set("Authorization", "secretaria")
    .send({ revision: lectura.body.data?.revision, idsHorarios, bloqueInicioId });
}
async function respuestaSalas(sala: string, adicionales: (string | number)[][] = []) {
  const libro = new ExcelJS.Workbook(); const hoja = libro.addWorksheet("Resumen Malla");
  hoja.addRow([...encabezadosExcelSalas]);
  hoja.addRow(["AS1", "Subject 1", 1, 30, "Professor", "Teórica", "Lunes", "08:10-09:30", sala]);
  adicionales.forEach(fila => hoja.addRow(fila));
  return Buffer.from(await libro.xlsx.writeBuffer());
}
async function importarSalas(sala: string, revision?: string, adicionales: (string | number)[][] = []) {
  return importarArchivoSalas(await respuestaSalas(sala, adicionales), revision);
}
async function importarArchivoSalas(archivo: Buffer, revision?: string) {
  const lectura = await consultar();
  return request(aplicacion).post(`${ruta}/salas/importar`).set("Authorization", "secretaria")
    .field("revision", revision ?? lectura.body.data.revision).attach("archivo", archivo, "salas.xlsx");
}
describe("Proposal results public HTTP contract", () => {
  async function comprobarRechazo(ids: number[], destino: number, codigo: string, mensaje: string) {
    const antes = await consultar();
    const previa = await movimiento(ids, destino, "validar-movimiento");
    expect(previa.status).toBe(200);
    expect(previa.body.data).toEqual({ valido: false, problemas: [{ codigo, mensaje }], cambios: [] });
    const guardado = await movimiento(ids, destino);
    expect(guardado.status).toBe(409);
    expect(guardado.body.message).toBe(mensaje);
    expect((await consultar()).body).toEqual(antes.body);
    expect(datos.escrituras).toBe(0);
  }
  function agregarMartes() {
    const martes = bloques.map(bloque => ({ ...bloque, id: 1000 + bloque.id, dia: "Martes" }));
    datos.contexto.bloques = [...bloques, ...martes];
    datos.contexto.disponibilidades.push(...martes.map(bloque => ({ profesorId: 7, bloqueId: bloque.id, planificacionSemestreId: 9 })));
  }
  it("S11 rejects an even institutional number with an odd ID in preview and save", async () => {
    datos.contexto.bloques = bloques.map(bloque => ({ ...bloque, id: bloque.id === 6 ? 61 : bloque.id }));
    datos.contexto.disponibilidades.push({ profesorId: 7, bloqueId: 61, planificacionSemestreId: 9 });
    await comprobarRechazo([100, 101], 61, "inicioPar", "La clase debe comenzar en un bloque institucional impar.");
  });
  it("S11 accepts an odd institutional number with an even ID", async () => {
    datos.contexto.bloques = bloques.map(bloque => ({ ...bloque, id: bloque.id === 5 ? 50 : bloque.id }));
    datos.contexto.disponibilidades.push({ profesorId: 7, bloqueId: 50, planificacionSemestreId: 9 });
    const antes = await consultar();
    const previa = await movimiento([100, 101], 50, "validar-movimiento");
    expect(previa.status).toBe(200); expect(previa.body.data).toMatchObject({ valido: true, problemas: [], cambios: [{ id: 100, bloqueId: 50 }, { id: 101, bloqueId: 6 }] });
    expect((await consultar()).body).toEqual(antes.body); expect(datos.escrituras).toBe(0);
    const guardado = await movimiento([100, 101], 50);
    expect(guardado.status).toBe(200); expect(guardado.body.data.sesiones[0].bloquesIds).toEqual([50, 6]);
    expect(datos.escrituras).toBe(1);
  });
  it.each([
    { numeros: [1, 2, 3, 4, 5], ids: [100, 101, 102] },
    { numeros: [1, 2, 3, 4, 5, 6, 7], ids: [102, 103, 104] },
  ])("S11 rejects newly even-start residual segments: %j", async ({ numeros, ids }) => {
    agregarMartes(); datos.contexto.entradas = entradas(oferta(), numeros);
    await comprobarRechazo(ids, 1001, "restantePar", "Los segmentos restantes deben comenzar en un bloque institucional impar.");
  });
  it.each([
    { numeros: [1, 2, 3, 4, 5], ids: [100, 101], restantes: [3, 4, 5] },
    { numeros: [1, 2, 3, 4], ids: [100, 101], restantes: [3, 4] },
    { numeros: [2, 3, 4], ids: [100, 101, 102], restantes: [] },
  ])("S11 preserves safe splits and whole legacy-even correction: %j", async ({ numeros, ids, restantes }) => {
    agregarMartes(); datos.contexto.entradas = entradas(oferta(), numeros);
    const antes = await consultar();
    const previa = await movimiento(ids, 1001, "validar-movimiento");
    expect(previa.status).toBe(200); expect(previa.body.data.valido).toBe(true); expect(previa.body.data.problemas).toEqual([]);
    expect((await consultar()).body).toEqual(antes.body); expect(datos.escrituras).toBe(0);
    const guardado = await movimiento(ids, 1001);
    expect(guardado.status).toBe(200);
    expect(guardado.body.data.sesiones.map((sesion: any) => sesion.bloquesIds)).toEqual([
      ids.map((_, indice) => 1001 + indice), ...(restantes.length ? [restantes] : []),
    ]);
    expect(datos.escrituras).toBe(1);
  });
  it("S11 rejects an odd destination that merges into an even-start legacy session", async () => {
    agregarMartes();
    const anteriores = entradas(oferta(), [2, 3]).map((entrada, indice) => ({ ...entrada, id: 200 + indice,
      bloqueId: 1002 + indice, bloque: datos.contexto.bloques.find((bloque: any) => bloque.id === 1002 + indice) }));
    // Move to 5 after a legacy 2–4 segment, across the institutional pair break.
    anteriores.push({ ...anteriores[1]!, id: 202, bloqueId: 1004, bloque: datos.contexto.bloques.find((bloque: any) => bloque.id === 1004) });
    datos.contexto.entradas.push(...anteriores);
    await comprobarRechazo([100, 101], 1005, "sesionPar", "La sesión resultante del destino debe comenzar en un bloque institucional impar.");
  });
  it("S11 does not block movement, reading or publication for unrelated legacy-even sessions", async () => {
    const externa = oferta(2, 2, 6); datos.contexto.entradas.push(...entradas(externa, [2, 3], 8, null));
    datos.contexto.ofertas.push(externa); datos.contexto.asignaturasMalla.push(externa.asignatura);
    expect((await consultar()).body.data.sesiones).toHaveLength(2);
    expect((await request(aplicacion).get(`${ruta}/validacion-publicacion`).set("Authorization", "secretaria")).body.data.valido).toBe(true);
    expect((await movimiento()).status).toBe(200);
    expect((await consultar()).body.data.sesiones.find((sesion: any) => sesion.ofertaId === 2).bloquesIds).toEqual([2, 3]);
  });
  it("S11 leaves an unrelated even-start session of the same offer/type/professor untouched", async () => {
    agregarMartes();
    datos.contexto.entradas.push(...entradas(oferta(), [6, 7]).map((entrada, indice) => ({ ...entrada, id: 200 + indice })));
    const previa = await movimiento([100, 101], 1001, "validar-movimiento");
    expect(previa.status).toBe(200); expect(previa.body.data.valido).toBe(true); expect(datos.escrituras).toBe(0);
    const guardado = await movimiento([100, 101], 1001);
    expect(guardado.status).toBe(200);
    expect(guardado.body.data.sesiones.map((sesion: any) => sesion.bloquesIds)).toEqual([[1001, 1002], [6, 7]]);
    expect(datos.escrituras).toBe(1);
  });
  it("S11 preserves conflict rejection when an odd target overlaps a two-block legacy-even group", async () => {
    agregarMartes();
    datos.contexto.entradas.push(...entradas(oferta(), [2, 3]).map((entrada, indice) => ({ ...entrada, id: 200 + indice,
      bloqueId: 1002 + indice, bloque: datos.contexto.bloques.find((bloque: any) => bloque.id === 1002 + indice) })));
    const antes = await consultar();
    const previa = await movimiento([100, 101], 1003, "validar-movimiento");
    expect(previa.status).toBe(200); expect(previa.body.data.valido).toBe(false);
    expect(previa.body.data.problemas.map((problema: any) => problema.codigo)).toEqual(["profesor", "nivel", "salaOcupada"]);
    const guardado = await movimiento([100, 101], 1003);
    expect(guardado.status).toBe(409);
    expect(guardado.body.message).toBe("El profesor tiene otra clase en este bloque. Hay otra clase del mismo nivel semestral en este bloque. La sala está ocupada en este bloque.");
    expect((await consultar()).body).toEqual(antes.body); expect(datos.escrituras).toBe(0);
  });
  it("reads grouped sessions with a revision, availability and room status", async () => {
    const respuesta = await consultar();
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(respuesta.body.data.sesiones[0]).toMatchObject({ idsHorarios: [100, 101], editable: true, estadoSala: "asignada" });
    expect(respuesta.body.data.disponibilidades).toHaveLength(8);
  });
  it("filters presentation by level but keeps full-plan conflicts", async () => {
    const otra = oferta(2, 2); datos.contexto.entradas.push(...entradas(otra, [5, 6], 7, null));
    expect((await consultar("?semestreMalla=1")).body.data.sesiones).toHaveLength(1);
    const antes = structuredClone(datos.contexto);
    expect((await movimiento()).status).toBe(409);
    expect(datos.contexto).toEqual(antes);
  });
  it("moves a whole group atomically and preserves its IDs, room and load", async () => {
    const respuesta = await movimiento();
    expect(respuesta.status).toBe(200);
    expect(datos.contexto.entradas.map((fila: any) => [fila.id, fila.bloqueId, fila.salaId])).toEqual([[100, 5, 4], [101, 6, 4]]);
    expect(respuesta.body.data.revision).toMatch(/^[a-f0-9]{64}$/);
  });
  it("validates a destination without saving", async () => {
    const antes = structuredClone(datos.contexto);
    const respuesta = await movimiento([100, 101], 5, "validar-movimiento");
    expect(respuesta.status).toBe(200); expect(respuesta.body.data.valido).toBe(true);
    expect(datos.contexto).toEqual(antes);
  });
  it("returns an invalid preview and rejects saving if any block is unavailable", async () => {
    datos.contexto.disponibilidades = datos.contexto.disponibilidades.filter((fila: any) => fila.bloqueId !== 6);
    const antes = structuredClone(datos.contexto);
    const previa = await movimiento([100, 101], 5, "validar-movimiento");
    expect(previa.status).toBe(200); expect(previa.body.data).toMatchObject({ valido: false });
    expect(previa.body.data.problemas).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: "disponibilidad" })]));
    expect((await movimiento()).status).toBe(409); expect(datos.contexto).toEqual(antes);
  });
  it("does not infer unrestricted availability from an empty declaration", async () => {
    datos.contexto.disponibilidades = [];
    expect((await movimiento()).status).toBe(409);
  });
  it("moves three blocks whole and rejects a two-block move leaving a singleton", async () => {
    datos.contexto.entradas = entradas(oferta(), [1, 2, 3]);
    const antes = structuredClone(datos.contexto);
    expect((await movimiento([100, 101], 5)).status).toBe(409); expect(datos.contexto).toEqual(antes);
    expect((await movimiento([100, 101, 102], 5)).status).toBe(200);
    expect(datos.contexto.entradas.map((fila: any) => fila.bloqueId)).toEqual([5, 6, 7]);
  });
  it("allows splitting four blocks into two groups and rejects middle-hole singletons", async () => {
    datos.contexto.entradas = entradas(oferta(), [1, 2, 3, 4]);
    expect((await movimiento([101, 102], 7)).status).toBe(409);
    expect((await movimiento([100, 101], 7)).status).toBe(200);
    expect(datos.contexto.entradas).toHaveLength(4);
  });
  it("rejects a different section at the same level and fixed external classes", async () => {
    const externa = oferta(2, 1, 6); externa.seccion = 9;
    datos.contexto.entradas.push(...entradas(externa, [5, 6], 8, null));
    expect((await movimiento()).status).toBe(409);
    const lectura = await consultar();
    expect(lectura.body.data.sesiones.find((sesion: any) => sesion.ofertaId === 2).editable).toBe(false);
    expect((await movimiento([200, 201], 7)).status).toBe(409);
  });
  it("rejects stale revisions and duplicate IDs without mutation", async () => {
    const lectura = await consultar();
    datos.contexto.disponibilidades.pop();
    const antes = structuredClone(datos.contexto);
    const respuesta = await request(aplicacion).post(`${ruta}/movimientos`).set("Authorization", "secretaria")
      .send({ revision: lectura.body.data.revision, idsHorarios: [100, 101], bloqueInicioId: 5 });
    expect(respuesta.status).toBe(409); expect(datos.contexto).toEqual(antes);
    expect((await movimiento([100, 100], 5)).status).toBe(400);
  });
  it("rolls back a persistence failure", async () => {
    datos.fallo = true; const antes = structuredClone(datos.contexto);
    const aviso = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try { expect((await movimiento()).status).toBe(500); expect(datos.contexto).toEqual(antes); }
    finally { aviso.mockRestore(); }
  });
  it.each([{ ids: [] }, { ids: [100] }, { ids: [100, 100] }, { ids: [100, -1] }])("rejects malformed selections without mutation: %j", async ({ ids }) => {
    const antes = structuredClone(datos.contexto);
    expect((await movimiento(ids, 5)).status).toBe(400);
    expect(datos.contexto).toEqual(antes);
  });
  it("reports missing load, room, availability and same-level collisions before publication", async () => {
    datos.contexto.entradas.pop(); datos.contexto.entradas[0].salaId = null; datos.contexto.disponibilidades = [];
    const otra = oferta(2); datos.contexto.ofertas.push(otra); datos.contexto.entradas.push(...entradas(otra, [1, 2], 8, null));
    const lectura = await consultar();
    const respuesta = await request(aplicacion).get(`${ruta}/validacion-publicacion`).set("Authorization", "secretaria");
    expect(respuesta.status).toBe(200); expect(respuesta.body.data.valido).toBe(false);
    for (const codigo of ["carga", "sala", "disponibilidad", "nivel"]) expect(respuesta.body.data.problemas).toEqual(expect.arrayContaining([expect.objectContaining({ codigo })]));
    expect((await request(aplicacion).post(`${ruta}/publicar`).set("Authorization", "secretaria").send({ revision: lectura.body.data.revision })).status).toBe(409);
    expect(datos.contexto.planificacion.estadoPlanificacion).toBe("propuesta");
  });
  it("publishes valid results and then rejects every write", async () => {
    const lectura = await consultar();
    expect((await request(aplicacion).post(`${ruta}/publicar`).set("Authorization", "secretaria").send({ revision: lectura.body.data.revision })).status).toBe(200);
    expect(datos.contexto.planificacion.estadoPlanificacion).toBe("publicado");
    expect((await consultar()).status).toBe(200); expect((await movimiento()).status).toBe(409);
    expect((await request(aplicacion).post(`${ruta}/publicar`).set("Authorization", "secretaria").send({ revision: lectura.body.data.revision })).status).toBe(409);
  });
  it("requires scoped authentication, proposal writes and strict input", async () => {
    expect((await request(aplicacion).get(ruta)).status).toBe(401);
    expect((await request(aplicacion).get(ruta).set("Authorization", "profesor")).status).toBe(403);
    expect((await consultar("?carreraId=99")).status).toBe(400);
    datos.contexto.planificacion.carreraId = 99; expect((await consultar()).status).toBe(404);
    datos.contexto.planificacion.carreraId = 3; datos.contexto.planificacion.estadoPlanificacion = "preparacion";
    expect((await movimiento()).status).toBe(409);
  });
  it.each(["SIN SALA", "sin sala"])("acepta la decisión explícita %s y permite completar la sala después", async valor => {
    datos.contexto.entradas.forEach((entrada: any) => { entrada.salaId = null; });
    const respuesta = await importarSalas(valor);
    expect(respuesta.status).toBe(200); expect(respuesta.body.data.pendientes).toBe(1);
    expect(datos.contexto.entradas.every((entrada: any) => entrada.salaId === null)).toBe(true);
    expect((await importarSalas("102AA")).status).toBe(200);
    expect(datos.contexto.entradas.every((entrada: any) => entrada.salaId === 5)).toBe(true);
  });
  it.each(["", "   "])("rechaza una sala vacía en una sesión pendiente sin modificar datos: %j", async valor => {
    datos.contexto.entradas.forEach((entrada: any) => { entrada.salaId = null; });
    const antes = structuredClone(datos.contexto);
    const lectura = await consultar();
    const respuesta = await importarSalas(valor);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ status: "error", errores: [{ fila: 2, columna: "Sala 1", mensaje: "Celda vacía. Indique una sala válida o escriba «SIN SALA»." }] });
    expect(datos.escrituras).toBe(0); expect(datos.contexto).toEqual(antes);
    expect((await consultar()).body).toEqual(lectura.body);
  });
  it("reúne las salas vacías y desconocidas en el mismo rechazo sin aplicar filas válidas", async () => {
    for (const [id, numeros] of [[2, [3, 4]], [3, [5, 6]]] as const) {
      const otra = oferta(id, id);
      datos.contexto.ofertas.push(otra); datos.contexto.asignaturasMalla.push(otra.asignatura);
      datos.contexto.entradas.push(...entradas(otra, [...numeros]));
    }
    datos.contexto.entradas.forEach((entrada: any) => { entrada.salaId = null; });
    const antes = structuredClone(datos.contexto); const lectura = await consultar();
    const respuesta = await importarSalas("102AA", undefined, [
      ["AS2", "Subject 2", 1, 30, "Professor", "Teórica", "Lunes", "09:40-11:00", ""],
      ["AS3", "Subject 3", 1, 30, "Professor", "Teórica", "Lunes", "11:10-12:30", "101-AAX"],
    ]);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([
      { fila: 3, columna: "Sala 1", mensaje: "Celda vacía. Indique una sala válida o escriba «SIN SALA»." },
      { fila: 4, columna: "Sala 1", mensaje: "La sala «101-AAX» no existe o su nombre es ambiguo." },
    ]);
    expect(datos.escrituras).toBe(0); expect(datos.contexto).toEqual(antes);
    expect((await consultar()).body).toEqual(lectura.body);
  });
  it("permite los espacios de sesiones inexistentes y conserva las sesiones omitidas", async () => {
    datos.contexto.entradas.forEach((entrada: any) => { entrada.salaId = null; });
    const otra = oferta(2, 2); const omitidas = entradas(otra, [3, 4]);
    datos.contexto.entradas.push(...omitidas); datos.contexto.ofertas.push(otra);
    const respuesta = await importarSalas("SIN SALA");
    expect(respuesta.status).toBe(200); expect(respuesta.body.data.pendientes).toBe(1);
    expect(datos.contexto.entradas.filter((entrada: any) => entrada.ofertaId === 2)).toEqual(omitidas);
    expect(datos.escrituras).toBe(0);
  });
  it("informa la sala vacía junto con el horario inválido de la misma sesión", async () => {
    const otra = oferta(2, 2); datos.contexto.ofertas.push(otra);
    datos.contexto.entradas.push(...entradas(otra, [3, 4]));
    datos.contexto.entradas.forEach((entrada: any) => { entrada.salaId = null; });
    const antes = structuredClone(datos.contexto);
    const respuesta = await importarSalas("102AA", undefined, [
      ["AS2", "Subject 2", 1, 30, "Professor", "Teórica", "Lunes", "horario inválido", ""],
    ]);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual(expect.arrayContaining([
      { fila: 3, columna: "Sala 1", mensaje: "Celda vacía. Indique una sala válida o escriba «SIN SALA»." },
      expect.objectContaining({ fila: 3, columna: "Horario 1" }),
    ]));
    expect(datos.escrituras).toBe(0); expect(datos.contexto).toEqual(antes);
  });
  it("identifica Sala 2 cuando la segunda sesión de la misma fila está sin respuesta", async () => {
    datos.contexto.ofertas[0].asignatura.tiposHora[0].horas = 4;
    datos.contexto.entradas.push(...entradas(datos.contexto.ofertas[0], [5, 6], 7, null).map((entrada, indice) => ({ ...entrada, id: 102 + indice })));
    const antes = structuredClone(datos.contexto); const lectura = await consultar();
    const libro = new ExcelJS.Workbook(); await libro.xlsx.load(Uint8Array.from(await respuestaSalas("102AA")).buffer);
    const fila = libro.worksheets[0]!.getRow(2);
    fila.getCell(10).value = fila.getCell(6).value;
    fila.getCell(11).value = fila.getCell(7).value;
    fila.getCell(12).value = `${bloques[4]!.horaInicio}-${bloques[5]!.horaTermino}`;
    fila.getCell(13).value = "";
    const respuesta = await request(aplicacion).post(`${ruta}/salas/importar`).set("Authorization", "secretaria")
      .field("revision", lectura.body.data.revision).attach("archivo", Buffer.from(await libro.xlsx.writeBuffer()), "salas.xlsx");
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([{ fila: 2, columna: "Sala 2", mensaje: "Celda vacía. Indique una sala válida o escriba «SIN SALA»." }]);
    expect(datos.escrituras).toBe(0); expect(datos.contexto).toEqual(antes);
    expect((await consultar()).body).toEqual(lectura.body);
  });
  it.each(["101AA", "102AA", "SIN SALA", "sin sala", "", "DESCONOCIDA"])("omite una sesión ya asignada aunque la respuesta indique %j", async sala => {
    const antes = structuredClone(datos.contexto); const lectura = await consultar();
    const respuesta = await importarSalas(sala);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ actualizadas: 0, pendientes: 0, omitidas: 1, errores: [] });
    expect(datos.contexto).toEqual(antes); expect(datos.escrituras).toBe(0);
    expect((await consultar()).body).toEqual(lectura.body);
  });
  it("subir dos veces la misma respuesta solo asigna las salas en la primera importación", async () => {
    datos.contexto.entradas.forEach((entrada: any) => { entrada.salaId = null; });
    const archivo = await respuestaSalas("102AA");
    const primera = await importarArchivoSalas(archivo);
    expect(primera.status).toBe(200);
    expect(primera.body.data).toEqual({ actualizadas: 1, pendientes: 0, omitidas: 0, errores: [] });
    const despues = await consultar(); const guardado = structuredClone(datos.contexto);
    const segunda = await importarArchivoSalas(archivo);
    expect(segunda.status).toBe(200);
    expect(segunda.body.data).toEqual({ actualizadas: 0, pendientes: 0, omitidas: 1, errores: [] });
    expect(datos.escrituras).toBe(1); expect(datos.contexto).toEqual(guardado);
    expect((await consultar()).body).toEqual(despues.body);
  });
  it("omite una sesión asignada y completa otra pendiente de la misma asignatura y fila", async () => {
    datos.contexto.ofertas[0].asignatura.tiposHora[0].horas = 4;
    datos.contexto.entradas.push(...entradas(datos.contexto.ofertas[0], [5, 6], 7, null).map((entrada, indice) => ({ ...entrada, id: 102 + indice })));
    const libro = new ExcelJS.Workbook(); await libro.xlsx.load(Uint8Array.from(await respuestaSalas("SALA_ANTIGUA")).buffer);
    const fila = libro.worksheets[0]!.getRow(2);
    fila.getCell(10).value = fila.getCell(6).value; fila.getCell(11).value = fila.getCell(7).value;
    fila.getCell(12).value = `${bloques[4]!.horaInicio}-${bloques[5]!.horaTermino}`; fila.getCell(13).value = "102AA";
    const respuesta = await importarArchivoSalas(Buffer.from(await libro.xlsx.writeBuffer()));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ actualizadas: 1, pendientes: 0, omitidas: 1, errores: [] });
    expect(datos.contexto.entradas.map((entrada: any) => entrada.salaId)).toEqual([4, 4, 5, 5]);
    expect(datos.cambiosSalas).toEqual([{ id: 102, salaId: 5 }, { id: 103, salaId: 5 }]);
  });
  it("completa solo los bloques pendientes de una sesión parcialmente asignada", async () => {
    datos.contexto.entradas[1].salaId = null;
    const respuesta = await importarSalas("101AA");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ actualizadas: 1, pendientes: 0, omitidas: 0, errores: [] });
    expect(datos.cambiosSalas).toEqual([{ id: 101, salaId: 4 }]);
    expect(datos.contexto.entradas.map((entrada: any) => entrada.salaId)).toEqual([4, 4]);
  });
  it("SIN SALA no elimina los bloques ya asignados de una sesión parcial", async () => {
    datos.contexto.entradas[1].salaId = null; const antes = structuredClone(datos.contexto);
    const respuesta = await importarSalas("SIN SALA");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toEqual({ actualizadas: 0, pendientes: 1, omitidas: 0, errores: [] });
    expect(datos.escrituras).toBe(0); expect(datos.contexto).toEqual(antes);
  });
  it("rechaza completar una sesión parcial con una sala distinta de sus bloques ya asignados", async () => {
    datos.contexto.entradas[1].salaId = null; const antes = structuredClone(datos.contexto);
    const respuesta = await importarSalas("102AA");
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([expect.objectContaining({ fila: 2, columna: "Sala 1", mensaje: expect.stringContaining("bloques ya asignados") })]);
    expect(datos.escrituras).toBe(0); expect(datos.contexto).toEqual(antes);
  });
  it("rechaza una identificación incorrecta aunque la asignatura ya tenga sala", async () => {
    const libro = new ExcelJS.Workbook(); await libro.xlsx.load(Uint8Array.from(await respuestaSalas("102AA")).buffer);
    libro.worksheets[0]!.getCell("H2").value = "11:10-12:30";
    const antes = structuredClone(datos.contexto);
    const respuesta = await importarArchivoSalas(Buffer.from(await libro.xlsx.writeBuffer()));
    expect(respuesta.status).toBe(400); expect(respuesta.body.errores).toEqual([expect.objectContaining({ columna: "Horario 1" })]);
    expect(datos.contexto).toEqual(antes); expect(datos.escrituras).toBe(0);
  });
  it("rechaza sesiones repetidas en el archivo aunque ya estén asignadas", async () => {
    const antes = structuredClone(datos.contexto);
    const respuesta = await importarSalas("101AA", undefined, [["AS1", "Subject 1", 1, 30, "Professor", "Teórica", "Lunes", "08:10-09:30", "102AA"]]);
    expect(respuesta.status).toBe(400); expect(respuesta.body.errores).toEqual([expect.objectContaining({ fila: 3, columna: "Horario 1", mensaje: expect.stringContaining("repetida") })]);
    expect(datos.contexto).toEqual(antes); expect(datos.escrituras).toBe(0);
  });
  it("exports only pending eligible sessions without splitting a partially assigned session", async () => {
    datos.contexto.entradas[1].salaId = null;
    const respuesta = await request(aplicacion).get(`${ruta}/salas/exportar?soloPendientes=true`).set("Authorization", "secretaria")
      .buffer(true).parse((respuestaBinaria, terminar) => {
        const fragmentos: Buffer[] = [];
        respuestaBinaria.on("data", fragmento => fragmentos.push(Buffer.from(fragmento)));
        respuestaBinaria.on("error", terminar);
        respuestaBinaria.on("end", () => terminar(null, Buffer.concat(fragmentos)));
      });
    expect(respuesta.status).toBe(200);
    const libro = new ExcelJS.Workbook(); await libro.xlsx.load(respuesta.body);
    expect(libro.worksheets[0]!.getRow(2).getCell(8).value).toBe("08:10-09:30");
    expect(libro.worksheets[0]!.getRow(2).getCell(9).text).toBe("");
  });
  it("rejects a pending-only proposal export when all rooms are assigned", async () => {
    const respuesta = await request(aplicacion).get(`${ruta}/salas/exportar?soloPendientes=true`).set("Authorization", "secretaria");
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.message).toBe("No hay sesiones pendientes de sala para exportar.");
    expect((await request(aplicacion).get(`${ruta}/salas/exportar`).set("Authorization", "secretaria")).status).toBe(200);
  });
  it("excludes exempt subjects, laboratories and external classes from room requests", async () => {
    datos.contexto.ofertas[0].asignatura.requiereSala = false;
    datos.contexto.entradas.forEach((entrada: any) => { entrada.oferta.asignatura.requiereSala = false; entrada.salaId = null; });
    expect((await consultar()).body.data.pendientesSala).toBe(0);
    expect((await request(aplicacion).get(`${ruta}/salas/exportar`).set("Authorization", "secretaria")).status).toBe(400);
    expect((await request(aplicacion).get(`${ruta}/validacion-publicacion`).set("Authorization", "secretaria")).body.data.valido).toBe(true);
    expect((await importarSalas("101AA")).status).toBe(400);
    datos.contexto.entradas.forEach((entrada: any) => { entrada.oferta.asignatura.requiereSala = true; entrada.tipoHora.tipo = "Laboratorio"; });
    expect((await consultar()).body.data.pendientesSala).toBe(0);
    expect((await request(aplicacion).get(`${ruta}/salas/exportar`).set("Authorization", "secretaria")).status).toBe(400);
    datos.contexto.entradas.forEach((entrada: any) => { entrada.tipoHora.tipo = "Teórica"; entrada.oferta.asignatura.departamentoId = 6; });
    expect((await consultar()).body.data.pendientesSala).toBe(0);
    expect((await request(aplicacion).get(`${ruta}/salas/exportar`).set("Authorization", "secretaria")).status).toBe(400);
  });
  it("rejects stale and published room imports without mutation", async () => {
    const lectura = await consultar(); datos.contexto.entradas[0].salaId = null;
    const antes = structuredClone(datos.contexto);
    expect((await importarSalas("SIN SALA", lectura.body.data.revision)).status).toBe(409); expect(datos.contexto).toEqual(antes);
    datos.contexto.planificacion.estadoPlanificacion = "publicado";
    expect((await importarSalas("SIN SALA")).status).toBe(409);
    expect((await request(aplicacion).get(`${ruta}/salas/exportar`).set("Authorization", "secretaria")).status).toBe(200);
  });
});
