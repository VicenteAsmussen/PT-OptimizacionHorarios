import { describe, expect, it, vi } from "vitest";
import { inicioOptimizacion } from "../../src/validations/optimizacion.validation.js";
import { exigirInicioOptimizacion, resolverIdempotencia } from "../../src/utils/optimizacion-ejecuciones.js";
import { construirEntradaOptimizacion } from "../../src/optimizacion/index.js";
import { huellaOptimizacion, optimizacionRepository } from "../../src/repositories/optimizacion.repository.js";

const controlesRepositorio = vi.hoisted(() => ({ transaccion: vi.fn() }));
vi.mock("../../src/config/db.js", () => ({ db: { transaction: controlesRepositorio.transaccion } }));
vi.mock("../../src/repositories/optimizacion-bloqueos.js", () => ({
  recuperarEjecucionesVencidas: vi.fn(), exigirSinEjecucionActiva: vi.fn(),
}));
vi.mock("../../src/repositories/bloques-reservados.js", () => ({ leerBloquesReservados: async () => [] }));
vi.mock("../../src/repositories/resultados-horarios.repository.js", () => ({ cargarContextoResultado: vi.fn() }));

const bloques = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"].flatMap((dia, indice) =>
  Array.from({ length: 16 }, (_, numero) => ({ id: indice * 16 + numero + 1, dia, numeroBloque: numero + 1 })));
const datos = { ofertas: [], bloques, disponibilidades: [], externos: [], recursos: [], reservas: [] };
const solicitud = { claveIdempotencia: "solicitud-tiempo", recursos: [] };

function simularRepositorio(previa?: Record<string, unknown>) {
  const planificacion = { id: 1, carreraId: 1, actual: true, estadoPlanificacion: "preparacion" };
  const consulta = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
    for: vi.fn().mockResolvedValueOnce([{ id: 1, nombre: "Ingeniería Civil en Informática" }])
      .mockResolvedValueOnce([planificacion]), limit: vi.fn().mockResolvedValue(previa ? [previa] : []) };
  const guardar = vi.fn((registro: Record<string, unknown>) => ({ returning: async () => [registro] }));
  const eliminar = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const tablas = Object.fromEntries(["carreraDepartamento", "carreraAsignatura", "ofertasAsignaturas",
    "disponibilidadProfesores", "horariosAsignaturas", "salas"].map(nombre => [nombre, { findMany: async () => [] }]));
  const transaccion = { query: { ...tablas, planificacionesSemestres: { findFirst: async () => planificacion },
    bloquesHorarios: { findMany: async () => bloques } }, select: () => consulta,
    delete: eliminar, insert: () => ({ values: guardar }) };
  controlesRepositorio.transaccion.mockImplementation(async accion => accion(transaccion));
  return { guardar, eliminar };
}

describe("admisión de ejecuciones", () => {
  it("exige preparación actual y ausencia de horarios gestionados", () => {
    expect(() => exigirInicioOptimizacion({ actual: true, estadoPlanificacion: "preparacion" }, 0)).not.toThrow();
    for (const [actual, estado, horarios] of [[false, "preparacion", 0], [true, "propuesta", 0], [true, "publicado", 0], [true, "preparacion", 1]] as const) {
      expect(() => exigirInicioOptimizacion({ actual, estadoPlanificacion: estado }, horarios)).toThrow();
    }
  });
  it("repite solamente la misma clave con los mismos parámetros", () => {
    const previa = { claveIdempotencia: "solicitud-1", revisionSolicitud: "abc" };
    expect(resolverIdempotencia(previa, "solicitud-1", "abc")).toBe(true);
    expect(resolverIdempotencia(undefined, "solicitud-1", "abc")).toBe(false);
    expect(() => resolverIdempotencia(previa, "solicitud-1", "def")).toThrow(/parámetros/);
  });
  it("no acepta recursos negativos, fraccionarios o sin procedencia", () => {
    const solicitud = { claveIdempotencia: "solicitud-123", recursos: [{ id: "lab", edificio: "Departamento", tipo: "Laboratorio", capacidad: 60, cantidad: 6, fuente: "Declaración departamental" }] };
    expect(inicioOptimizacion.safeParse(solicitud).success).toBe(true);
    for (const cantidad of [-1, 1.5]) expect(inicioOptimizacion.safeParse({ ...solicitud, recursos: [{ ...solicitud.recursos[0], cantidad }] }).success).toBe(false);
    expect(inicioOptimizacion.safeParse({ ...solicitud, recursos: [{ ...solicitud.recursos[0], fuente: "" }] }).success).toBe(false);
    expect(inicioOptimizacion.safeParse({ ...solicitud, aplicar: true }).success).toBe(false);
  });
});

describe("parámetros persistidos con repositorio simulado", () => {
  it("registra 1800 segundos en la entrada y metadata del nuevo intento", async () => {
    const simulacion = simularRepositorio();
    const entrada = construirEntradaOptimizacion(datos);
    const respuesta = await optimizacionRepository.iniciar(1, solicitud, "propietario-sintetico",
      entrada.versionModelo, () => entrada);
    expect(respuesta.nueva).toBe(true);
    expect(respuesta.ejecucion.parametros).toEqual({ recursos: [], limiteSolverSegundos: 1800 });
    expect(respuesta.ejecucion.entrada).toEqual(entrada);
    expect(respuesta.ejecucion.versionModelo).toBe("notebook-v2-1");
    expect(simulacion.guardar).toHaveBeenCalledOnce();
  });

  it.each([300, 600, 900])("recupera el intento previo de %s segundos sin reescribirlo ni adaptarlo", async limiteSolverSegundos => {
    const entrada = construirEntradaOptimizacion(datos, { limiteSolverSegundos });
    const previa = { id: "intento-anterior", claveIdempotencia: solicitud.claveIdempotencia,
      revisionSolicitud: huellaOptimizacion(solicitud.recursos), entrada,
      parametros: { recursos: [], limiteSolverSegundos } };
    const antes = structuredClone(previa), simulacion = simularRepositorio(previa), adaptar = vi.fn();
    const respuesta = await optimizacionRepository.iniciar(1, solicitud, "propietario-sintetico",
      entrada.versionModelo, adaptar);
    expect(respuesta).toEqual({ nueva: false, ejecucion: antes });
    expect(previa).toEqual(antes);
    expect(adaptar).not.toHaveBeenCalled();
    expect(simulacion.guardar).not.toHaveBeenCalled();
    expect(simulacion.eliminar).not.toHaveBeenCalled();
  });
});
