import { describe, expect, it } from "vitest";
import {
  construirEntradaOptimizacion, prepararCategoriasSalas, validarSalidaOptimizacion,
  type DatosOptimizacion, type EntradaOptimizacion, type OfertaOptimizacion,
  type SalidaOptimizacion,
} from "../../src/optimizacion/index.js";

const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
function oferta(id = 1, codigo = "A", seccion = 1, nivel = 1): OfertaOptimizacion {
  return { id, asignaturaCodigo: codigo, seccion, cupos: 30, semestreMalla: nivel,
    esCritica: false, requiereSala: true,
    componentes: [{ tipoHoraId: 1, tipo: "T", horas: 2, profesorId: id }] };
}
function datos(ofertas = [oferta()]): DatosOptimizacion {
  const bloques = dias.flatMap((dia, d) => Array.from({ length: 16 }, (_, b) =>
    ({ id: d * 16 + b + 1, dia, numeroBloque: b + 1 })));
  return { ofertas, bloques, disponibilidades: ofertas.flatMap(o => o.componentes.flatMap(c =>
    c.profesorId === null ? [] : bloques.map(b => ({ profesorId: c.profesorId!, bloqueId: b.id })))), externos: [], reservas: [],
    recursos: [{ id: "AA-Sala-90", edificio: "AA", tipo: "Sala", capacidad: 90,
      cantidad: 20, fuente: "Declaración sintética" }] };
}
function salida(entrada: EntradaOptimizacion, comienzos = [1]): SalidaOptimizacion {
  const asignaciones = entrada.ofertas.flatMap((o, i) => o.componentes.flatMap(c =>
    Array.from({ length: c.horas }, (_, h) => ({ ofertaId: o.id, tipoHoraId: c.tipoHoraId,
      bloqueId: comienzos[i]! + h, categoriaId: entrada.recursos[0]!.id }))));
  const ocupacion = (id: number) => new Set(asignaciones.filter(a => a.ofertaId === id).map(a => a.bloqueId));
  const protecciones = entrada.parejas.flatMap(p => p.seccionesA.flatMap(a => p.seccionesB.map(b => ({
    parejaId: p.id, ofertaAId: a, ofertaBId: b,
    protegida: ![...ocupacion(a)].some(bloque => ocupacion(b).has(bloque)),
  }))));
  return { version: 1, revision: entrada.revision, estado: "optimo", asignaciones,
    faltantes: entrada.ofertas.flatMap(o => o.componentes.map(c =>
      ({ ofertaId: o.id, tipoHoraId: c.tipoHoraId, horas: 0 }))), protecciones,
    objetivo: protecciones.reduce((s, p) => s + (!p.protegida && entrada.parejas.find(x => x.id === p.parejaId)!.status === 0.5 ? 0.5 : 0), 0) };
}

describe("contrato matemático puro", () => {
  it("normaliza sin mutar y revisa también datos sin carga", () => {
    const base = datos([oferta(2, "B"), oferta()]);
    const antes = structuredClone(base);
    const entrada = construirEntradaOptimizacion(base);
    expect(base).toEqual(antes);
    const invertidos = { ...base, ofertas: [...base.ofertas].reverse(), bloques: [...base.bloques].reverse(),
      disponibilidades: [...base.disponibilidades].reverse() };
    expect(construirEntradaOptimizacion(invertidos)).toEqual(entrada);
    expect(entrada.parametros.limiteSolverSegundos).toBe(300);
    expect(entrada.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(construirEntradaOptimizacion({ ...base, reservas: [1] }).revision).not.toBe(entrada.revision);
    expect(validarSalidaOptimizacion(entrada, salida(entrada, [3, 1]))).toMatchObject({ valida: true, completa: true, errores: [] });
  });

  it("excluye carga cero y exige docente único T/P/L e inconsistencia visible", () => {
    const cero = oferta(2, "CERO"); cero.requiereSala = false; cero.componentes[0]!.horas = 0; cero.componentes[0]!.profesorId = null;
    expect(construirEntradaOptimizacion(datos([cero])).ofertas).toEqual([]);
    const sinSala = oferta(); sinSala.requiereSala = false;
    expect(() => construirEntradaOptimizacion(datos([sinSala]))).toThrow("requiereSala=false con carga positiva");
    const sinDocente = oferta(); sinDocente.componentes[0]!.profesorId = null;
    expect(() => construirEntradaOptimizacion(datos([sinDocente]))).toThrow("docente único");
    const duplicada = oferta(); duplicada.componentes.push({ ...duplicada.componentes[0]! });
    expect(() => construirEntradaOptimizacion(datos([duplicada]))).toThrow();
    const completa = oferta(); completa.componentes.push(
      { tipoHoraId: 2, tipo: "P", horas: 2, profesorId: 2 }, { tipoHoraId: 3, tipo: "L", horas: 2, profesorId: 3 });
    const base = datos([completa]);
    base.recursos.push({ id: "LAB", edificio: "Departamento", tipo: "Laboratorio", capacidad: 35, cantidad: 1, fuente: "Declaración" });
    const entrada = construirEntradaOptimizacion(base);
    const resultado = salida(entrada);
    resultado.asignaciones.forEach(a => { a.bloqueId += (a.tipoHoraId - 1) * 6; if (a.tipoHoraId === 3) a.categoriaId = "LAB"; });
    expect(validarSalidaOptimizacion(entrada, resultado)).toMatchObject({ valida: true, completa: true });
    resultado.asignaciones = resultado.asignaciones.filter(a => a.tipoHoraId !== 3);
    expect(validarSalidaOptimizacion(entrada, resultado).completa).toBe(false);
  });

  it("crea obligatorias por nivel y críticas n+2 sin parejas superiores artificiales", () => {
    const critica = oferta(); critica.esCritica = true;
    const entrada = construirEntradaOptimizacion(datos([critica, oferta(2, "B", 1, 3), oferta(3, "C", 1, 3)]));
    expect(entrada.parejas.map(p => [p.asignaturaA, p.asignaturaB, p.status])).toEqual([
      ["A", "B", 0.5], ["A", "C", 0.5], ["B", "C", 1],
    ]);
    expect(entrada.certificadoPrioridad).toEqual({ cotaPenalidadFlexible: 1, prioridadCertificada: true });
    const muchas = Array.from({ length: 45 }, (_, i) => oferta(i + 1, "A", i + 1));
    muchas.forEach(o => o.esCritica = true);
    const superiores = Array.from({ length: 45 }, (_, i) => oferta(i + 46, "B", i + 1, 3));
    const grande = construirEntradaOptimizacion(datos([...muchas, ...superiores]));
    expect(grande.certificadoPrioridad).toEqual({ cotaPenalidadFlexible: 1012.5, prioridadCertificada: false });
  });

  it("exige ceil(50%) por pareja completa sin selección global", () => {
    const entrada = construirEntradaOptimizacion(datos([oferta(), oferta(2, "A", 2), oferta(3, "B"), oferta(4, "B", 2)]));
    const buena = salida(entrada, [1, 3, 1, 3]);
    expect(validarSalidaOptimizacion(entrada, buena)).toMatchObject({ valida: true, completa: true });
    const mala = salida(entrada, [1, 1, 1, 1]);
    const antes = structuredClone(mala);
    expect(validarSalidaOptimizacion(entrada, mala).errores).toContain("Protección del 50 % incumplida.");
    expect(mala).toEqual(antes);
    const impar = construirEntradaOptimizacion(datos([oferta(), ...Array.from({ length: 5 }, (_, i) => oferta(i + 2, "B", i + 1))]));
    expect(validarSalidaOptimizacion(impar, salida(impar, [1, 1, 1, 1, 3, 3])).valida).toBe(false);
    expect(validarSalidaOptimizacion(impar, salida(impar, [1, 1, 1, 3, 3, 3])).valida).toBe(true);
  });

  it("cobra una combinación flexible, no sus bloques, y admite límite completo", () => {
    const critica = oferta(); critica.esCritica = true; critica.componentes[0]!.horas = 4;
    const superior = oferta(2, "B", 1, 3); superior.componentes[0]!.horas = 4;
    const entrada = construirEntradaOptimizacion(datos([critica, superior]));
    const resultado = salida(entrada, [1, 1]); resultado.estado = "limite_tiempo";
    expect(resultado.objetivo).toBe(0.5);
    expect(validarSalidaOptimizacion(entrada, resultado)).toMatchObject({ valida: true, completa: true });
    resultado.objetivo = 2;
    expect(validarSalidaOptimizacion(entrada, resultado).valida).toBe(false);
  });

  it.each(["revision", "dominio", "duplicada", "carga", "capacidad", "tipo", "cantidad", "reserva", "disponibilidad", "docente", "categoriaContinua", "inicioPar", "minimoDos", "maximoCuatro", "proteccionFalsa"])("rechaza %s sin mutar entradas", regla => {
    const base = datos([oferta(), oferta(2, "B")]);
    if (regla === "docente") base.ofertas[1]!.componentes[0]!.profesorId = 1;
    if (regla === "reserva") base.reservas = [1];
    if (regla === "disponibilidad") base.disponibilidades = base.disponibilidades.filter(d => d.bloqueId !== 1);
    if (regla === "capacidad") base.recursos[0]!.capacidad = 20;
    if (regla === "tipo") base.recursos[0]!.tipo = "Laboratorio";
    if (regla === "cantidad") base.recursos[0]!.cantidad = 1;
    if (regla === "maximoCuatro") base.ofertas[0]!.componentes[0]!.horas = 6;
    if (regla === "minimoDos") base.ofertas[0]!.componentes[0]!.horas = 1;
    if (regla === "categoriaContinua") base.recursos.push({ ...base.recursos[0]!, id: "OTRA", edificio: "AB" });
    const entrada = construirEntradaOptimizacion(base);
    const resultado = salida(entrada, [1, ["cantidad", "docente", "proteccionFalsa"].includes(regla) ? 1 : 9]);
    if (regla === "revision") resultado.revision = "0".repeat(64);
    if (regla === "dominio") resultado.asignaciones[0]!.bloqueId = 999;
    if (regla === "duplicada") resultado.asignaciones.push({ ...resultado.asignaciones[0]! });
    if (regla === "carga") resultado.faltantes[0]!.horas = 1;
    if (regla === "categoriaContinua") resultado.asignaciones[1]!.categoriaId = "OTRA";
    if (regla === "inicioPar") resultado.asignaciones.slice(0, 2).forEach(a => a.bloqueId++);
    if (regla === "proteccionFalsa") resultado.protecciones[0]!.protegida = true;
    const antes = structuredClone({ entrada, resultado });
    const validacion = validarSalidaOptimizacion(entrada, resultado);
    expect(validacion.valida).toBe(false);
    expect(validacion.errores.length).toBeGreaterThan(0);
    expect({ entrada, resultado }).toEqual(antes);
  });

  it("permite seis bloques diarios separados, pero exige categoría continua por componente", () => {
    const o = oferta(); o.componentes[0]!.horas = 6;
    const entrada = construirEntradaOptimizacion(datos([o]));
    const resultado = salida(entrada);
    resultado.asignaciones.slice(4).forEach(a => a.bloqueId += 2);
    expect(validarSalidaOptimizacion(entrada, resultado)).toMatchObject({ valida: true, completa: true });
  });

  it("externos solo afectan ocupación académica, no recursos ni docentes", () => {
    const base = datos(); base.recursos[0]!.cantidad = 1;
    base.externos = [1, 2].map(bloqueId => ({ ofertaId: 2, asignaturaCodigo: "B", seccion: 1,
      semestreMalla: 3, tipoHoraId: 1, bloqueId }));
    let entrada = construirEntradaOptimizacion(base);
    expect(validarSalidaOptimizacion(entrada, salida(entrada))).toMatchObject({ valida: true, completa: true });
    base.externos.forEach(e => e.semestreMalla = 1);
    entrada = construirEntradaOptimizacion(base);
    const resultado = salida(entrada);
    resultado.protecciones.forEach(p => p.protegida = false);
    resultado.objetivo = 0;
    expect(validarSalidaOptimizacion(entrada, resultado).valida).toBe(false);
    base.externos.forEach(e => { e.ofertaId = 1; e.asignaturaCodigo = "A"; });
    entrada = construirEntradaOptimizacion(base);
    expect(validarSalidaOptimizacion(entrada, salida(entrada)).valida).toBe(false);
  });

  it("diagnostica carga faltante y disponibilidad ordenada sin aceptar parcial como completa", () => {
    const entrada = construirEntradaOptimizacion(datos());
    const resultado = salida(entrada); resultado.asignaciones = []; resultado.faltantes[0]!.horas = 2; resultado.objetivo = 2000;
    expect(validarSalidaOptimizacion(entrada, resultado)).toMatchObject({ valida: true, completa: false,
      faltantes: [{ ofertaId: 1, tipoHoraId: 1, horas: 2 }], disponibilidadDocente: [{ profesorId: 1, bloquesDisponibles: 80 }] });
    const sinSolucion: SalidaOptimizacion = { version: 1, revision: entrada.revision, estado: "infactible",
      asignaciones: [], faltantes: [], protecciones: [], objetivo: null };
    expect(validarSalidaOptimizacion(entrada, sinSolucion)).toMatchObject({ valida: true, completa: false });
  });

  it("clasifica únicamente códigos acreditados y sugiere ceil mitad sin inventario de laboratorio", () => {
    const preparacion = prepararCategoriasSalas([
      { id: 1, nombre: "A101AA", tipo: "Sala", capacidad: 90 },
      { id: 2, nombre: "A102AA", tipo: "Sala", capacidad: 90 },
      { id: 3, nombre: "A103AA", tipo: "Sala", capacidad: 90 },
      { id: 4, nombre: "A101AB", tipo: "Sala", capacidad: 90 },
      { id: 5, nombre: "S101II", tipo: "Sala", capacidad: 40 },
      { id: 6, nombre: "NUEVAAA", tipo: "Sala", capacidad: 90 },
      { id: 7, nombre: "LAB", tipo: "Laboratorio", capacidad: 60 },
    ]);
    expect(preparacion.categorias).toHaveLength(3);
    expect(preparacion.categorias[0]).toMatchObject({ edificio: "AA", tipo: "Sala", capacidad: 90, cantidadCatalogo: 3, cantidadSugerida: 2 });
    expect(preparacion.categorias.every(c => !Object.hasOwn(c, "cantidad"))).toBe(true);
    expect(preparacion.diagnosticos).toHaveLength(2);
  });

  it("mantiene cupos cero admitidos por el catálogo sin alterar la carga", () => {
    const o = oferta(); o.cupos = 0;
    const entrada = construirEntradaOptimizacion(datos([o]));
    expect(entrada.ofertas[0]!.componentes[0]!.horas).toBe(2);
    expect(validarSalidaOptimizacion(entrada, salida(entrada))).toMatchObject({ valida: true, completa: true });
  });

  it("rechaza carga divergente, grilla incompleta, identidades y salida con sala física", () => {
    const a = oferta(), b = oferta(2, "A", 2); b.componentes[0]!.horas = 4;
    expect(() => construirEntradaOptimizacion(datos([a, b]))).toThrow("carga");
    const grilla = datos(); grilla.bloques.pop();
    expect(() => construirEntradaOptimizacion(grilla)).toThrow();
    const externas = datos(); externas.externos = [
      { ofertaId: 2, asignaturaCodigo: "B", seccion: 1, semestreMalla: 3, tipoHoraId: 1, bloqueId: 1 },
      { ofertaId: 2, asignaturaCodigo: "C", seccion: 1, semestreMalla: 3, tipoHoraId: 1, bloqueId: 1 },
    ];
    expect(() => construirEntradaOptimizacion(externas)).toThrow("inconsistente");
    const entrada = construirEntradaOptimizacion(datos());
    const resultado = salida(entrada);
    expect(validarSalidaOptimizacion(entrada, { ...resultado, asignaciones: resultado.asignaciones.map(a => ({ ...a, salaId: 1 })) }).valida).toBe(false);
    expect(() => construirEntradaOptimizacion(datos(), { limiteSolverSegundos: 301 })).toThrow();
  });

  it("aplica máximo continuo sobre T/P juntos y admite cambiar categoría entre componentes", () => {
    const o = oferta(); o.componentes[0]!.horas = 4;
    o.componentes.push({ tipoHoraId: 2, tipo: "P", horas: 2, profesorId: 2 });
    const base = datos([o]); base.recursos.push({ ...base.recursos[0]!, id: "AB", edificio: "AB" });
    const entrada = construirEntradaOptimizacion(base);
    const resultado = salida(entrada);
    resultado.asignaciones.filter(a => a.tipoHoraId === 2).forEach((a, i) => { a.bloqueId = 5 + i; a.categoriaId = "AB"; });
    expect(validarSalidaOptimizacion(entrada, resultado).errores).toContain("Más de cuatro bloques continuos por sección.");
    resultado.asignaciones.filter(a => a.tipoHoraId === 2).forEach(a => a.bloqueId += 2);
    expect(validarSalidaOptimizacion(entrada, resultado)).toMatchObject({ valida: true, completa: true });
  });
});
