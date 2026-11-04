import { describe, expect, it } from "vitest";
import { prepararMovimiento, validarPublicacionResultado, type ContextoResultado, type EntradaResultado } from "../src/utils/resultados-horarios.js";

// Datos sintéticos en memoria, sin importar conexiones ni ejecutar el optimizador.
function escenario() {
  const contexto = {
    planificacion: { id: 9, carreraId: 3, codigo: "2026-1", actual: true, estadoPlanificacion: "propuesta" },
    entradas: [], ofertas: [], asignaturasMalla: [], departamentosGestionadosIds: [5], bloquesReservadosIds: [],
    bloques: Array.from({ length: 12 }, (_, indice) => ({ id: indice + 1, dia: "Lunes", numeroBloque: indice + 1,
      horaInicio: `${String(8 + Math.floor(indice * 40 / 60)).padStart(2, "0")}:${String(indice * 40 % 60).padStart(2, "0")}`,
      horaTermino: `${String(8 + Math.floor((indice + 1) * 40 / 60)).padStart(2, "0")}:${String((indice + 1) * 40 % 60).padStart(2, "0")}` })),
    salas: [], disponibilidades: [],
  } as unknown as ContextoResultado;
  function agregar(codigo: string, seccion: number, numeros: number[], opciones: { nivel?: number; externo?: boolean; critica?: boolean; tipos?: number[]; horas?: number } = {}) {
    const id = contexto.ofertas.length + 1;
    const tipos = opciones.tipos ?? numeros.map(() => 1);
    const asignatura = { codigo, nombre: codigo, departamentoId: opciones.externo ? 6 : 5, semestreMalla: opciones.nivel ?? 1,
      requiereSala: true, esCritica: opciones.critica ?? false,
      tiposHora: [...new Set(tipos)].map(tipoHoraId => ({ asignaturaCodigo: codigo, tipoHoraId, horas: opciones.horas ?? tipos.filter(tipo => tipo === tipoHoraId).length,
        tipoHora: { id: tipoHoraId, tipo: tipoHoraId === 3 ? "Laboratorio" : tipoHoraId === 2 ? "Práctica" : "Teórica" } })) };
    const oferta = { id, seccion, asignaturaCodigo: codigo, cupos: 30, planificacionSemestreId: 9, asignatura };
    contexto.ofertas.push(oferta);
    contexto.asignaturasMalla.push(asignatura);
    contexto.salas.push({ id, nombre: `Sala ${id}`, tipo: "Sala" });
    contexto.disponibilidades.push(...contexto.bloques.map(bloque => ({ profesorId: id, bloqueId: bloque.id, planificacionSemestreId: 9 })));
    numeros.forEach((bloqueId, indice) => contexto.entradas.push({ id: id * 100 + indice, ofertaId: id, tipoHoraId: tipos[indice],
      bloqueId, salaId: opciones.externo ? null : id, planificacionSemestreId: 9, oferta, bloque: contexto.bloques[bloqueId - 1],
      tipoHora: asignatura.tiposHora.find(tipo => tipo.tipoHoraId === tipos[indice])!.tipoHora,
      asignacion: { profesorId: id, profesor: { id, nombre: `Docente ${id}` } }, sala: null } as EntradaResultado));
    return oferta;
  }
  return { contexto, agregar };
}
const codigos = (contexto: ContextoResultado) => validarPublicacionResultado(contexto).problemas.map(problema => problema.codigo);

describe("Compatibilidad equivalente por pareja de asignaturas", () => {
  it("acepta exactamente la mitad de combinaciones y simultaneidad entre secciones distintas de la misma asignatura", () => {
    const { contexto, agregar } = escenario();
    agregar("A", 1, [1, 2]); agregar("A", 2, [1, 2]);
    agregar("B", 1, [1, 2]); agregar("B", 2, [3, 4]);
    expect(validarPublicacionResultado(contexto).problemas).toEqual([]);
  });
  it("redondea hacia arriba el 50 % de tres por tres secciones", () => {
    const { contexto, agregar } = escenario();
    agregar("A", 1, [1, 2]); agregar("A", 2, [1, 2]); agregar("A", 3, [3, 4]);
    agregar("B", 1, [1, 2]); agregar("B", 2, [1, 2]); agregar("B", 3, [3, 4]);
    // Cuatro de nueve no alcanzan las cinco combinaciones exigidas.
    expect(codigos(contexto)).toEqual(["nivel"]);
    contexto.entradas.filter(entrada => entrada.ofertaId === 6).forEach((entrada, indice) => {
      entrada.bloqueId = 5 + indice; entrada.bloque = contexto.bloques[4 + indice]!;
    });
    expect(codigos(contexto)).toEqual([]);
  });
  it("no construye combinaciones mezclando T/P/L de secciones distintas", () => {
    const { contexto, agregar } = escenario();
    agregar("A", 1, [1, 2, 3, 4], { tipos: [1, 1, 3, 3] });
    agregar("A", 2, [5, 6, 7, 8], { tipos: [1, 1, 3, 3] });
    agregar("B", 1, [1, 2, 7, 8], { tipos: [1, 1, 2, 2] });
    expect(codigos(contexto)).toEqual(["nivel"]);
  });
  it("incluye externos fijos en la pareja, pero no exige una selección global de secciones", () => {
    const { contexto, agregar } = escenario();
    agregar("A", 1, [1, 2]); agregar("A", 2, [3, 4]);
    agregar("B", 1, [1, 2], { externo: true }); agregar("B", 2, [3, 4], { externo: true });
    agregar("C", 1, [1, 2]); agregar("C", 2, [3, 4]);
    expect(codigos(contexto)).toEqual([]);
  });
  it("no bloquea parejas críticas n y n+2 ni crea restricciones adicionales", () => {
    const { contexto, agregar } = escenario();
    agregar("A", 1, [1, 2], { critica: true }); agregar("B", 1, [1, 2], { nivel: 3 });
    agregar("C", 1, [3, 4], { nivel: 3 });
    expect(codigos(contexto)).toEqual([]);
  });
  it("rechaza componentes simultáneos de una misma sección y conserva los controles de profesor y sala", () => {
    const { contexto, agregar } = escenario();
    agregar("A", 1, [1, 2, 1, 2], { tipos: [1, 1, 3, 3] });
    expect(codigos(contexto)).toEqual(expect.arrayContaining(["seccion", "profesor", "salaOcupada"]));
  });
  it("no cuenta una sección incompleta como combinación compatible", () => {
    const { contexto, agregar } = escenario();
    agregar("A", 1, [1, 2]); agregar("B", 1, [3, 4], { horas: 4 });
    expect(codigos(contexto)).toEqual(expect.arrayContaining(["carga", "nivel"]));
  });
  it.each([{ numeros: [1] }, { numeros: [2, 3] }, { numeros: [1, 2, 3, 4, 5, 6] }])("rechaza continuidad gestionada inválida %j al publicar", ({ numeros }) => {
    const { contexto, agregar } = escenario(); agregar("A", 1, numeros);
    expect(codigos(contexto)).toContain("continuidad");
  });
  it("permite más de cuatro bloques diarios si las sesiones son discontinuas", () => {
    const { contexto, agregar } = escenario(); agregar("A", 1, [1, 2, 5, 6, 9, 10]);
    expect(codigos(contexto)).toEqual([]);
  });
  it("no deja un segmento de más de cuatro bloques continuos al dividir una sesión heredada", () => {
    const { contexto, agregar } = escenario(); agregar("A", 1, [1, 2, 3, 4, 5, 6, 7, 8]);
    const antes = structuredClone(contexto);
    expect(prepararMovimiento(contexto, { revision: "", idsHorarios: [100, 101], bloqueInicioId: 11 }))
      .toMatchObject({ valido: false, problemas: [expect.objectContaining({ codigo: "continuidad" })] });
    expect(contexto).toEqual(antes);
  });
  it("muestra inconsistencia positiva sin excluir carga y no pide faltantes para carga cero", () => {
    const { contexto, agregar } = escenario();
    const oferta = agregar("A", 1, [1, 2]); oferta.asignatura.requiereSala = false;
    const cero = agregar("CERO", 1, [], { horas: 0 });
    cero.asignatura.tiposHora = [{ asignaturaCodigo: "CERO", tipoHoraId: 1, horas: 0, tipoHora: { id: 1, tipo: "Teórica" } }];
    const resultado = validarPublicacionResultado(contexto);
    expect(resultado.problemas).toEqual([]);
    expect(resultado).toMatchObject({ advertencias: [expect.objectContaining({ codigo: "requiereSala", ofertaId: oferta.id })] });
    contexto.entradas = [];
    expect(codigos(contexto)).toContain("carga");
  });
});

describe("Presupuesto abstracto de la ejecución", () => {
  function recursos(contexto: ContextoResultado, cantidad = 1, capacidad = 30) {
    Object.assign(contexto, { recursosOptimizacion: {
      categorias: [{ id: "sala-A", edificio: "A", tipo: "Sala", capacidad, cantidad, fuente: "Prueba sintética" }],
      asignaciones: contexto.entradas.map(entrada => ({ ofertaId: entrada.ofertaId, tipoHoraId: entrada.tipoHoraId,
        bloqueId: entrada.bloqueId, categoriaId: "sala-A" })),
    } });
  }
  it("rechaza publicación sobre presupuesto aun con salas físicas diferentes", () => {
    const { contexto, agregar } = escenario(); agregar("A", 1, [1, 2]); agregar("B", 1, [1, 2], { nivel: 3 });
    recursos(contexto);
    expect(codigos(contexto)).toContain("recursos");
  });
  it("rechaza un movimiento que excede el snapshot y no modifica el contexto", () => {
    const { contexto, agregar } = escenario(); agregar("A", 1, [1, 2]); agregar("B", 1, [5, 6], { nivel: 3 }); recursos(contexto);
    const antes = structuredClone(contexto);
    const resultado = prepararMovimiento(contexto, { revision: "", idsHorarios: [100, 101], bloqueInicioId: 5 });
    expect(resultado).toMatchObject({ valido: false, problemas: expect.arrayContaining([expect.objectContaining({ codigo: "recursos" })]) });
    expect(contexto).toEqual(antes);
  });
  it("comprueba capacidad y permite reasignar categorías sin confundirlas con salaId", () => {
    const { contexto, agregar } = escenario(); agregar("A", 1, [1, 2]); recursos(contexto, 1, 20);
    expect(codigos(contexto)).toContain("recursos");
    Object.assign(contexto, { recursosOptimizacion: { categorias: [
      { id: "pequena", edificio: "A", tipo: "Sala", capacidad: 20, cantidad: 1, fuente: "Prueba sintética" },
      { id: "grande", edificio: "B", tipo: "Sala", capacidad: 60, cantidad: 1, fuente: "Prueba sintética" },
    ], asignaciones: [] } });
    expect(codigos(contexto)).toEqual([]);
  });
  it("incluye laboratorios abstractos y excluye externos del presupuesto", () => {
    const { contexto, agregar } = escenario(); agregar("LAB", 1, [1, 2], { tipos: [3, 3] });
    agregar("EXT", 1, [1, 2], { nivel: 3, externo: true }); recursos(contexto);
    expect(codigos(contexto)).toContain("recursos");
    Object.assign(contexto, { recursosOptimizacion: { categorias: [{ id: "lab", edificio: "A", tipo: "Laboratorio", capacidad: 30, cantidad: 1, fuente: "Prueba sintética" }], asignaciones: [] } });
    expect(codigos(contexto)).toEqual([]);
  });
  it("reasigna recursos por capacidad y usa el presupuesto también después de mover", () => {
    const { contexto, agregar } = escenario(); const pequena = agregar("A", 1, [1, 2]); pequena.cupos = 20;
    const grande = agregar("B", 1, [5, 6], { nivel: 3 }); grande.cupos = 60;
    contexto.recursosOptimizacion = { categorias: [
      { id: "chica", edificio: "A", tipo: "Sala", capacidad: 20, cantidad: 1, fuente: "Prueba sintética" },
      { id: "grande", edificio: "B", tipo: "Sala", capacidad: 60, cantidad: 1, fuente: "Prueba sintética" },
    ], asignaciones: contexto.entradas.map(entrada => ({ ofertaId: entrada.ofertaId, tipoHoraId: entrada.tipoHoraId,
      bloqueId: entrada.bloqueId, categoriaId: "grande" })) };
    const antes = structuredClone(contexto);
    const movimiento = prepararMovimiento(contexto, { revision: "", idsHorarios: [100, 101], bloqueInicioId: 5 });
    expect(movimiento.valido).toBe(true); expect(contexto).toEqual(antes);
    for (const cambio of movimiento.cambios) {
      const entrada = contexto.entradas.find(entrada => entrada.id === cambio.id)!;
      entrada.bloqueId = cambio.bloqueId; entrada.bloque = contexto.bloques.find(bloque => bloque.id === cambio.bloqueId)!;
    }
    expect(codigos(contexto)).toEqual([]);
    expect(contexto.recursosOptimizacion).toEqual(antes.recursosOptimizacion);
    contexto.recursosOptimizacion.categorias[0]!.cantidad = 0;
    expect(codigos(contexto)).toContain("recursos");
  });
});
