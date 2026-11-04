import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { optimizacionRouter } from "../src/routes/optimizacion.routes.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import type { CapturaOptimizacion } from "../src/repositories/optimizacion.repository.js";
import type { EntradaOptimizacion, SalidaOptimizacion } from "../src/optimizacion/index.js";

const controles = vi.hoisted(() => ({ rol: "admin", repositorio: {} as Record<string, ReturnType<typeof vi.fn>>,
  entradas: [] as EntradaOptimizacion[], resolver: undefined as undefined | ((salida: SalidaOptimizacion) => void) }));
vi.mock("../src/repositories/optimizacion.repository.js", () => ({ optimizacionRepository: controles.repositorio }));
vi.mock("../src/optimizacion/proceso.js", () => ({ ejecutarJulia: vi.fn((entrada: EntradaOptimizacion) => {
  controles.entradas.push(entrada);
  return new Promise<SalidaOptimizacion>(resolver => { controles.resolver = resolver; });
}), cerrarProcesosJulia: vi.fn() }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate(req: Request, _res: Response, next: NextFunction) {
  req.user = { id: 1, rol: controles.rol } as Request["user"]; next();
} }));

const app = express(); app.use(express.json()); app.use("/modelo", optimizacionRouter); app.use(errorHandler);
const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const bloques = dias.flatMap((dia, indice) => Array.from({ length: 16 }, (_, numero) => ({ id: indice * 16 + numero + 1, dia, numeroBloque: numero + 1, horaInicio: "08:10", horaTermino: "08:50" })));
let captura: CapturaOptimizacion;
let ejecucion: Record<string, unknown> | undefined;
const parametros = { claveIdempotencia: "solicitud-http-1", recursos: [{ id: "AA-Sala-90", edificio: "AA", tipo: "Sala", capacidad: 90, cantidad: 1, fuente: "Inventario sintético" }] };
beforeEach(() => {
  controles.rol = "admin"; controles.entradas.length = 0; controles.resolver = undefined; ejecucion = undefined;
  captura = { planificacion: { id: 1, carreraId: 1, codigo: "2099-2", actual: true, estadoPlanificacion: "preparacion" },
    revision: "revision-db", horariosGestionados: 0, gestionados: [1], relaciones: [], disponibilidades: [{ profesorId: 1, bloqueId: 1 }, { profesorId: 1, bloqueId: 2 }],
    horarios: [], bloques, catalogoSalas: [{ id: 1, nombre: "A101AA", capacidad: 90, tipo: "Sala" }], reservas: [],
    malla: [{ asignaturaCodigo: "INT" }], ofertas: [{ id: 1, asignaturaCodigo: "INT", seccion: 1, cupos: 30,
      asignatura: { codigo: "INT", departamentoId: 1, semestreMalla: 2, esCritica: false, requiereSala: true,
        tiposHora: [{ tipoHoraId: 1, horas: 2, tipoHora: { id: 1, tipo: "Teórica" } }] },
      asignaciones: [{ tipoHoraId: 1, profesorId: 1, profesor: { id: 1, departamentoId: 1 } }] }] } as unknown as CapturaOptimizacion;
  controles.repositorio.preparar = vi.fn(async () => ({ captura, activa: null }));
  controles.repositorio.iniciar = vi.fn(async (_id, cuerpo, propietario, versionModelo, adaptar) => {
    if (ejecucion) return { ejecucion, nueva: false };
    ejecucion = { id: randomUUID(), planificacionSemestreId: 1, propietario, versionModelo, estado: "en_ejecucion", entrada: adaptar(captura), parametros: cuerpo,
      iniciadaEn: new Date(), resultado: null, diagnostico: null };
    return { ejecucion, nueva: true };
  });
  controles.repositorio.aplicar = vi.fn(async (_id, _propietario, salida, validar) => {
    validar(captura, ejecucion!.entrada); ejecucion!.estado = "aplicada"; ejecucion!.resultado = salida; return true;
  });
  controles.repositorio.terminar = vi.fn(async (_id, _propietario, estado, resultado, diagnostico) => { Object.assign(ejecucion!, { estado, resultado, diagnostico }); });
  controles.repositorio.consultar = vi.fn(async () => ejecucion);
  controles.repositorio.ultima = vi.fn(async () => ejecucion ?? null);
  controles.repositorio.renovar = vi.fn(async () => true);
});
function salida(estado: SalidaOptimizacion["estado"] = "optimo", completa = true): SalidaOptimizacion {
  const entrada = controles.entradas[0]!;
  return { version: 1, revision: entrada.revision, estado, objetivo: completa ? 0 : 2000,
    asignaciones: completa ? [1, 2].map(bloqueId => ({ ofertaId: 1, tipoHoraId: 1, bloqueId, categoriaId: "AA-Sala-90" })) : [],
    faltantes: [{ ofertaId: 1, tipoHoraId: 1, horas: completa ? 0 : 2 }], protecciones: [] };
}
describe("contrato HTTP y seguimiento del modelo", () => {
  it("consulta preparación y cantidades sugeridas sin ejecutar ni asumir laboratorios", async () => {
    const respuesta = await request(app).get("/modelo/planificaciones/1/preparacion");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.categoriasSalas[0].cantidadSugerida).toBe(1);
    expect(respuesta.body.data.laboratorios.categoriasSugeridas).toEqual([]);
    expect(controles.entradas).toEqual([]);
  });
  it("responde 202 y permite recuperar por ID y última aunque termine la solicitud", async () => {
    const iniciada = await request(app).post("/modelo/planificaciones/1/ejecuciones").send(parametros);
    expect(iniciada.status).toBe(202);
    const id = iniciada.body.data.id;
    expect((await request(app).get(`/modelo/ejecuciones/${id}`)).body.data.estado).toBe("en_ejecucion");
    const repetida = await request(app).post("/modelo/planificaciones/1/ejecuciones").send(parametros);
    expect(repetida.body.data.id).toBe(id); expect(repetida.body.data.reutilizada).toBe(true); expect(controles.entradas).toHaveLength(1);
    controles.resolver!(salida());
    await vi.waitFor(() => expect(controles.repositorio.aplicar).toHaveBeenCalledOnce());
    expect((await request(app).get("/modelo/planificaciones/1/ultima-ejecucion")).body.data.estado).toBe("aplicada");
    expect((await request(app).get(`/modelo/ejecuciones/${id}`)).body.data).not.toHaveProperty("propietario");
  });
  it("admite solución completa al límite sin afirmar optimalidad", async () => {
    await request(app).post("/modelo/planificaciones/1/ejecuciones").send(parametros);
    controles.resolver!(salida("limite_tiempo"));
    await vi.waitFor(() => expect(controles.repositorio.aplicar).toHaveBeenCalledOnce());
    expect(ejecucion!.resultado).toMatchObject({ estado: "limite_tiempo" });
  });
  it("óptimo incompleto no aplica y diagnostica faltantes por componente", async () => {
    await request(app).post("/modelo/planificaciones/1/ejecuciones").send(parametros);
    controles.resolver!(salida("optimo", false));
    await vi.waitFor(() => expect(controles.repositorio.terminar).toHaveBeenCalledOnce());
    expect(controles.repositorio.aplicar).not.toHaveBeenCalled();
    expect(ejecucion!.estado).toBe("carga_incompleta");
    expect(ejecucion!.diagnostico).toMatchObject({ faltantes: [{ asignaturaCodigo: "INT", seccion: 1, componente: "T", horas: 2 }] });
  });
  it("rechaza una salida de otra revisión sin persistir horarios", async () => {
    await request(app).post("/modelo/planificaciones/1/ejecuciones").send(parametros);
    controles.resolver!({ ...salida(), revision: "b".repeat(64) });
    await vi.waitFor(() => expect(controles.repositorio.terminar).toHaveBeenCalledOnce());
    expect(controles.repositorio.aplicar).not.toHaveBeenCalled(); expect(ejecucion!.estado).toBe("error");
  });
  it("no ofrece aplicar/reemplazar ni permite roles docentes", async () => {
    expect((await request(app).post("/modelo/planificaciones/1/ejecuciones").send({ ...parametros, aplicar: true })).status).toBe(400);
    controles.rol = "profesor";
    expect((await request(app).get("/modelo/planificaciones/1/preparacion")).status).toBe(403);
    expect(controles.repositorio.iniciar).not.toHaveBeenCalled();
  });
});
