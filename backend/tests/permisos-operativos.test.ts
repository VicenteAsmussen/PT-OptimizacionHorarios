import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const dobles = vi.hoisted(() => ({ llamadas: [] as string[] }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate(req: any, _res: any, siguiente: any) {
  req.user = { id: 1, rol: req.headers.authorization }; siguiente();
} }));
vi.mock("../src/controllers/horarios.controller.js", () => ({ horariosController: new Proxy({}, { get: (_, nombre) =>
  (_req: any, res: any) => { dobles.llamadas.push(String(nombre)); res.json({ status: "success", data: [] }); } }) }));
vi.mock("../src/controllers/disponibilidad.controller.js", () => ({ disponibilidadController: new Proxy({}, { get: (_, nombre) =>
  (_req: any, res: any) => { dobles.llamadas.push(String(nombre)); res.json({ status: "success", data: [] }); } }) }));
vi.mock("../src/controllers/ofertas.controller.js", () => ({ ofertasController: new Proxy({}, { get: (_, nombre) =>
  (_req: any, res: any) => { dobles.llamadas.push(String(nombre)); res.json({ status: "success", data: [] }); } }) }));
vi.mock("../src/controllers/optimizacion.controller.js", () => ({ optimizacionController: new Proxy({}, { get: (_, nombre) =>
  (_req: any, res: any) => { dobles.llamadas.push(String(nombre)); res.json({ status: "success", data: [] }); } }) }));
vi.mock("../src/controllers/resultados-horarios.controller.js", () => ({ resultadosHorariosController: new Proxy({}, { get: (_, nombre) =>
  (_req: any, res: any) => { dobles.llamadas.push(String(nombre)); res.json({ status: "success", data: [] }); } }) }));
import { horariosRouter } from "../src/routes/horarios.routes.js";
import { disponibilidadRouter } from "../src/routes/disponibilidad.routes.js";
import { ofertasRouter } from "../src/routes/ofertas.routes.js";
import { optimizacionRouter } from "../src/routes/optimizacion.routes.js";
import { resultadosHorariosRouter } from "../src/routes/resultados-horarios.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

const aplicacion = express(); aplicacion.use(express.json());
for (const [ruta, router] of [["horarios", horariosRouter], ["disponibilidad", disponibilidadRouter], ["ofertas", ofertasRouter],
  ["modelo", optimizacionRouter], ["resultados", resultadosHorariosRouter]] as const) aplicacion.use(`/${ruta}`, router);
aplicacion.use(errorHandler);
beforeEach(() => { dobles.llamadas = []; });
const operaciones = [
  ...["admin", "secretaria"].flatMap(rol => [
    [rol, "post", "/horarios"], [rol, "put", "/horarios/1"], [rol, "delete", "/horarios/1"], [rol, "delete", "/horarios/oferta/1"],
  ]),
  ...["admin", "secretaria", "profesor"].flatMap(rol => [
    [rol, "post", "/disponibilidad"], [rol, "post", "/disponibilidad/sincronizar"],
    [rol, "delete", "/disponibilidad/1"], [rol, "delete", "/disponibilidad/profesor/1/planificacion-semestre/1"],
  ]),
  ["profesor", "get", "/disponibilidad"], ["profesor", "get", "/disponibilidad/1"],
  ["profesor", "get", "/horarios"], ["profesor", "get", "/horarios/1"],
  ["admin", "post", "/ofertas"], ["admin", "put", "/ofertas/1"], ["admin", "delete", "/ofertas/1"],
  ["admin", "get", "/horarios/excel/salas"], ["admin", "post", "/horarios/excel/salas/importar"],
  ["admin", "post", "/modelo/planificaciones/1/ejecuciones"], ["admin", "get", "/modelo/planificaciones/1/preparacion"],
  ["admin", "get", "/modelo/planificaciones/1/ultima-ejecucion"], ["admin", "get", "/modelo/ejecuciones/00000000-0000-4000-8000-000000000001"],
  ["admin", "post", "/resultados/1/validar-movimiento"], ["admin", "post", "/resultados/1/movimientos"],
  ["admin", "get", "/resultados/1/validacion-publicacion"], ["admin", "post", "/resultados/1/publicar"],
  ["admin", "get", "/resultados/1/salas/exportar"], ["admin", "post", "/resultados/1/salas/importar"],
  ["admin", "post", "/resultados/1/descartar"],
];
describe("permisos operativos antes de validación y persistencia", () => {
  it.each(operaciones)("deniega %s %s %s sin invocar controladores", async (rol, metodo, ruta) => {
    const respuesta = await (request(aplicacion) as any)[metodo](ruta).set("Authorization", rol);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toEqual({ status: "error", statusCode: 403, message: expect.stringContaining("Acceso denegado:") });
    expect(dobles.llamadas).toEqual([]);
  });
  it.each(["admin", "secretaria"])("conserva consulta de horarios, resultados, disponibilidad y ofertas para %s", async rol => {
    for (const ruta of ["/horarios", "/horarios/1", "/resultados/1", "/disponibilidad", "/disponibilidad/1", "/ofertas", "/ofertas/1"]) {
      const respuesta = await request(aplicacion).get(ruta).set("Authorization", rol);
      expect(respuesta.status).toBe(200); expect(respuesta.body).toEqual({ status: "success", data: [] });
    }
    expect(dobles.llamadas).toHaveLength(7);
  });
  it("conserva seguimiento y Excel de secretaría y autoservicio del profesor", async () => {
    for (const [rol, ruta] of [["secretaria", "/modelo/planificaciones/1/preparacion"], ["secretaria", "/horarios/excel/salas?planificacionSemestreId=1"],
      ["profesor", "/horarios/mi-horario/contexto"], ["profesor", "/horarios/mi-horario"], ["profesor", "/disponibilidad/mi-disponibilidad?planificacionSemestreId=1"]]) {
      const respuesta = await request(aplicacion).get(ruta).set("Authorization", rol);
      expect(respuesta.status).toBe(200); expect(respuesta.body).toEqual({ status: "success", data: [] });
    }
    expect(dobles.llamadas).toHaveLength(5);
  });
  it("conserva escritura de ofertas de secretaría y disponibilidad propia del profesor", async () => {
    for (const [rol, ruta, cuerpo] of [
      ["secretaria", "/ofertas", { asignaturaCodigo: "A1", planificacionSemestreId: 1, seccion: 1, cupos: 30, asignaciones: [] }],
      ["profesor", "/disponibilidad/mi-disponibilidad", { planificacionSemestreId: 1, bloquesIds: [1, 2] }],
    ] as const) {
      const respuesta = await request(aplicacion).post(ruta).set("Authorization", rol).send(cuerpo);
      expect(respuesta.status).toBe(200); expect(respuesta.body).toEqual({ status: "success", data: [] });
    }
    expect(dobles.llamadas).toEqual(["create", "guardarMiDisponibilidad"]);
  });
});
