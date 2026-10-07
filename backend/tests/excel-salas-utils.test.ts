import { describe, expect, it } from "vitest";
import {
  encabezadosExcelSalas, normalizarTextoCelda, normalizarDia,
  normalizarCodigoSala, analizarHorario, formatearHorario, agruparBloquesEnSesiones,
  type BloqueExcelSala,
} from "../src/utils/excel-salas.js";

const bloque = (numeroBloque: number, horaInicio: string, horaTermino: string, dia = "Lunes"): BloqueExcelSala =>
  ({ dia, numeroBloque, horaInicio, horaTermino });

describe("contrato Excel de salas", () => {
  it("expone las 23 columnas visibles en su orden", () => {
    expect(encabezadosExcelSalas).toEqual([
      "Código Asig.", "Sem", "Sección", "Nombre Asignatura", "Hrs. Teóricas",
      "Hrs. Prácticas", "Hrs. Laborat", "Profesor",
      ...Array.from({ length: 5 }, (_, indice) => [`Día ${indice + 1}`, `Horario ${indice + 1}`, `Sala ${indice + 1}`]).flat(),
    ]);
  });

  it("normaliza texto simple, texto enriquecido y resultados de fórmulas ExcelJS", () => {
    expect(normalizarTextoCelda(null)).toBe("");
    expect(normalizarTextoCelda("  Nombre\n  Apellido ")).toBe("Nombre Apellido");
    expect(normalizarTextoCelda(101)).toBe("101");
    expect(normalizarTextoCelda({ richText: [{ text: " Ana " }, { text: "Pérez " }] })).toBe("Ana Pérez");
    expect(normalizarTextoCelda({ formula: "1+1", result: 2 })).toBe("2");
    expect(normalizarTextoCelda({ text: " Aula ", hyperlink: "https://example.com" })).toBe("Aula");
    expect(normalizarTextoCelda({ error: "#REF!" })).toBe("#REF!");
  });

  it.each([[" miércoles ", "Miércoles"], ["MIERCOLES", "Miércoles"], ["sábado", "Sábado"], ["LUNES", "Lunes"]])(
    "normaliza el día %s", (entrada, esperado) => {
      expect(normalizarDia(entrada)).toEqual({ exito: true, valor: esperado });
    },
  );
  it.each(["", "Lun", "festivo"])("rechaza día desconocido: %s", (entrada) => {
    expect(normalizarDia(entrada)).toMatchObject({ exito: false, error: expect.stringContaining("día") });
  });

  it("normaliza códigos de sala sin perder ceros iniciales", () => {
    expect(normalizarCodigoSala(" 101-aa ")).toBe("101AA");
    expect(normalizarCodigoSala("101AA")).toBe("101AA");
    expect(normalizarCodigoSala("001-AA")).toBe("001AA");
    expect(normalizarCodigoSala(null)).toBe("");
  });

  it("analiza y formatea rangos con espacios alrededor del guion", () => {
    const resultado = analizarHorario(" 08:10 - 09:30 ");
    expect(resultado).toEqual({ exito: true, valor: { horaInicio: "08:10", horaTermino: "09:30" } });
    if (resultado.exito) expect(formatearHorario(resultado.valor)).toBe("08:10-09:30");
  });
  it.each([
    ["", "HH:MM-HH:MM"], ["8:10-09:30", "HH:MM-HH:MM"],
    ["24:00-25:00", "00:00"], ["08:60-09:30", "00:00"],
    ["09:30-08:10", "posterior"], ["08:10-08:10", "posterior"],
  ])("devuelve un error accionable para %s", (entrada, mensaje) => {
    expect(analizarHorario(entrada)).toMatchObject({ exito: false, error: expect.stringContaining(mensaje) });
  });
});

describe("agrupación pura de bloques", () => {
  it("ordena por día/número, une adyacentes y no modifica la entrada", () => {
    const bloques = [bloque(2, "08:50", "09:30"), bloque(1, "08:10", "08:50", "Martes"), bloque(1, "08:10", "08:50")];
    const copia = structuredClone(bloques);
    expect(agruparBloquesEnSesiones(bloques)).toEqual({ exito: true, valor: [
      { dia: "Lunes", horaInicio: "08:10", horaTermino: "09:30", numerosBloque: [1, 2] },
      { dia: "Martes", horaInicio: "08:10", horaTermino: "08:50", numerosBloque: [1] },
    ] });
    expect(bloques).toEqual(copia);
  });

  it("acepta pausa de diez minutos tras pares institucionales de cuarenta minutos", () => {
    expect(agruparBloquesEnSesiones([
      bloque(1, "08:10", "08:50"), bloque(2, "08:50", "09:30"),
      bloque(3, "09:40", "10:20"), bloque(4, "10:20", "11:00"), bloque(5, "11:10", "11:50"),
    ])).toMatchObject({ exito: true, valor: [{ numerosBloque: [1, 2, 3, 4, 5], horaTermino: "11:50" }] });
    // Una sesión puede empezar en el segundo bloque del par institucional.
    expect(agruparBloquesEnSesiones([bloque(2, "08:50", "09:30"), bloque(3, "09:40", "10:20")]))
      .toMatchObject({ exito: true, valor: [{ numerosBloque: [2, 3] }] });
  });

  it.each([
    [bloque(1, "08:10", "08:50"), bloque(2, "09:00", "09:40")],
    [bloque(2, "08:50", "09:30"), bloque(3, "09:50", "10:30")],
    [bloque(1, "08:10", "08:50"), bloque(3, "08:50", "09:30")],
    [bloque(2, "08:50", "09:20"), bloque(3, "09:30", "10:10")],
    [bloque(2, "08:50", "09:30"), bloque(3, "09:40", "10:10")],
  ])("separa bloques no continuos %#", (primero, segundo) => {
    const resultado = agruparBloquesEnSesiones([primero, segundo]);
    expect(resultado.exito && resultado.valor).toHaveLength(2);
  });

  it("acepta entrada vacía y rechaza bloques inválidos sin lanzar excepciones", () => {
    expect(agruparBloquesEnSesiones([])).toEqual({ exito: true, valor: [] });
    for (const invalido of [bloque(0, "08:10", "08:50"), bloque(1, "xx", "08:50"), bloque(1, "08:10", "08:50", "otro")]) {
      expect(agruparBloquesEnSesiones([invalido])).toMatchObject({ exito: false, error: expect.any(String) });
    }
    expect(agruparBloquesEnSesiones([bloque(1, "08:10", "08:50"), bloque(1, "08:10", "08:50")]))
      .toMatchObject({ exito: false, error: expect.stringContaining("duplicado") });
  });
});
