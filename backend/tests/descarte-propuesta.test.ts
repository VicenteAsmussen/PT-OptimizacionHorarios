import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHash } from "node:crypto";
import { ConflictError } from "../src/utils/errors.js";

const estado = vi.hoisted(() => ({ contexto: {} as any, ejecuciones: [] as string[], activa: false, fallo: false, escrituras: 0 }));
vi.mock("../src/config/db.js", () => ({ db: {} }));
vi.mock("../src/repositories/ofertas.repository.js", () => ({ ofertasRepository: {
  findAll: async () => structuredClone(estado.contexto.ofertas),
} }));
vi.mock("../src/utils/alcance-carrera.js", () => ({ resolverAlcanceCarrera: async () => ({ carreraId: 3 }) }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate(req: any, _res: any, siguiente: any) {
  req.user = { id: 1, rol: req.headers.authorization }; siguiente();
} }));
vi.mock("../src/repositories/resultados-horarios.repository.js", () => ({ resultadosHorariosRepository: {
  leer: async () => structuredClone(estado.contexto),
  conBloqueo: async (_id: number, operar: any) => {
    if (estado.activa) throw new ConflictError("Hay una ejecución activa para esta planificación.");
    const copia = structuredClone(estado.contexto);
    const ejecuciones = [...estado.ejecuciones];
    let escrituras = 0;
    const respuesta = await operar(copia, { descartar: async (idsHorarios: number[], ejecucionesIds: string[]) => {
      const ids = new Set(idsHorarios);
      copia.entradas = copia.entradas.filter((fila: any) => !ids.has(fila.id));
      copia.planificacion.estadoPlanificacion = "preparacion";
      for (const ligada of ejecucionesIds) ejecuciones.splice(ejecuciones.indexOf(ligada), 1);
      escrituras++;
      if (estado.fallo) throw new ConflictError("No se pudo descartar la propuesta.");
    } });
    estado.contexto = copia; estado.ejecuciones = ejecuciones; estado.escrituras += escrituras;
    return respuesta;
  },
} }));
import { resultadosHorariosRouter } from "../src/routes/resultados-horarios.routes.js";
import { ofertasRouter } from "../src/routes/ofertas.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
const aplicacion = express(); aplicacion.use(express.json()); aplicacion.use("/resultados", resultadosHorariosRouter); aplicacion.use("/ofertas", ofertasRouter); aplicacion.use(errorHandler);
const consultar = () => request(aplicacion).get("/resultados/9").set("Authorization", "secretaria");
const consultarOfertas = () => request(aplicacion).get("/ofertas").set("Authorization", "secretaria");
const descartar = (revision: string, confirmar = true, rol = "secretaria") => request(aplicacion).post("/resultados/9/descartar")
  .set("Authorization", rol).send({ revision, confirmar });
beforeEach(() => {
  const bloque = { id: 1, dia: "Lunes", numeroBloque: 1, horaInicio: "08:10", horaTermino: "08:50" };
  const entradas = [5, 6].map((departamentoId, indice) => ({ id: indice + 1, bloqueId: 1, bloque, salaId: null,
    ofertaId: indice + 1, tipoHoraId: 1, tipoHora: { id: 1, tipo: "Teórica" }, ejecucionOptimizacionId: indice ? null : "ejecucion-propuesta",
    oferta: { id: indice + 1, seccion: 1, asignatura: { codigo: `A${indice}`, nombre: "Asignatura sintética", departamentoId, semestreMalla: 1, tiposHora: [] } },
    asignacion: { profesorId: indice + 1, profesor: { id: indice + 1, nombre: "Docente sintético" } } }));
  estado.contexto = { planificacion: { id: 9, carreraId: 3, actual: true, codigo: "2099-1", estadoPlanificacion: "propuesta" }, entradas,
    ofertas: entradas.map(fila => ({ ...fila.oferta, asignaciones: [fila.asignacion] })), asignaturasMalla: entradas.map(fila => fila.oferta.asignatura), bloques: [bloque], salas: [],
    disponibilidades: [{ profesorId: 1, bloqueId: 1, planificacionSemestreId: 9 }], departamentosGestionadosIds: [5], bloquesReservadosIds: [] };
  estado.ejecuciones = ["ejecucion-propuesta", "ejecucion-historica"]; estado.activa = false; estado.fallo = false; estado.escrituras = 0;
});
describe("descarte de propuesta mediante HTTP", () => {
  it("rechaza una revisión anterior tras cambiar una oferta sin modificar el estado", async () => {
    const lectura = await consultar();
    expect(lectura.status).toBe(200);
    estado.contexto.ofertas[0].seccion = 77;
    const huella = () => createHash("sha256")
      .update(JSON.stringify({ contexto: estado.contexto, ejecuciones: estado.ejecuciones }))
      .digest("hex");
    const antes = huella();
    const respuesta = await descartar(lectura.body.data.revision);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.message).toBe("El horario o sus restricciones cambiaron. Vuelva a consultar antes de confirmar.");
    expect(huella()).toBe(antes);
    expect(estado.escrituras).toBe(0);
  });
  it("secretaría descarta solo gestionados y ejecución ligada, conserva preparación académica y externos", async () => {
    const anterior = await consultar(); expect(anterior.status).toBe(200);
    const ofertasAnteriores = await consultarOfertas(); expect(ofertasAnteriores.status).toBe(200);
    const respuesta = await descartar(anterior.body.data.revision);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "success", data: { planificacion: { ...estado.contexto.planificacion, estadoPlanificacion: "preparacion" } } });
    const posterior = await consultar(); expect(posterior.status).toBe(200);
    expect(posterior.body.data.planificacion.estadoPlanificacion).toBe("preparacion");
    expect(posterior.body.data.sesiones).toEqual(anterior.body.data.sesiones.filter((fila: any) => fila.estadoSala === "externa"));
    expect(posterior.body.data.disponibilidades).toEqual(anterior.body.data.disponibilidades);
    const ofertasPosteriores = await consultarOfertas(); expect(ofertasPosteriores.status).toBe(200);
    expect(ofertasPosteriores.body).toEqual(ofertasAnteriores.body);
    expect(ofertasPosteriores.body.data.map((fila: any) => fila.asignaciones[0].profesorId)).toEqual([1, 2]);
    expect(estado.ejecuciones).toEqual(["ejecucion-historica"]); expect(estado.escrituras).toBe(1);
  });
  it.each(["ajena", "publicada", "histórica", "obsoleta", "activa", "sin confirmar", "admin", "fallo transaccional"])("rechaza %s sin mutaciones", async caso => {
    const lectura = await consultar(); const revision = lectura.body.data.revision;
    if (caso === "ajena") estado.contexto.planificacion.carreraId = 99;
    if (caso === "publicada") estado.contexto.planificacion.estadoPlanificacion = "publicado";
    if (caso === "histórica") estado.contexto.planificacion.actual = false;
    if (caso === "obsoleta") estado.contexto.disponibilidades = [];
    estado.activa = caso === "activa"; estado.fallo = caso === "fallo transaccional";
    const antes = structuredClone({ contexto: estado.contexto, ejecuciones: estado.ejecuciones });
    const respuesta = await descartar(revision, caso !== "sin confirmar", caso === "admin" ? "admin" : "secretaria");
    expect(respuesta.status).toBe(caso === "ajena" ? 404 : caso === "admin" ? 403 : caso === "sin confirmar" ? 400 : 409);
    expect(respuesta.body.status).toBe("error");
    const mensajes: Record<string, string> = {
      ajena: "Planificación no encontrada.",
      publicada: "Solo se puede modificar una planificación actual en Propuesta.",
      histórica: "Solo se puede modificar una planificación actual en Propuesta.",
      obsoleta: "El horario o sus restricciones cambiaron. Vuelva a consultar antes de confirmar.",
      activa: "Hay una ejecución activa para esta planificación.",
      "sin confirmar": "Error de validación: confirmar: Invalid input: expected true",
      admin: "Acceso denegado: Se requiere uno de los roles [secretaria], tu rol actual es 'admin'",
      "fallo transaccional": "No se pudo descartar la propuesta.",
    };
    expect(respuesta.body).toEqual({ status: "error", statusCode: respuesta.status, message: mensajes[caso] });
    expect({ contexto: estado.contexto, ejecuciones: estado.ejecuciones }).toEqual(antes); expect(estado.escrituras).toBe(0);
  });
});
