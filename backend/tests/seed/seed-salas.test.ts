import { describe, expect, it } from "vitest";
import { datosSalas, datosPlanificacionHorarios } from "../../src/db/seeds/data/horarios.js";
import { normalizarCodigoSala } from "../../src/utils/excel/excel-salas.js";

// Independent transcription of columns B/H, Salas_Institucionales (2022-11-16).
const capacidadesEsperadas = {
  A101AA: 90, A102AA: 90, A103AA: 90, A104AA: 90,
  A101AB: 90, A102AB: 90, A201AB: 90, A202AB: 90, A301AB: 90, A302AB: 90,
  A101AC: 70, A102AC: 70, A103AC: 70, A104AC: 70, A105AC: 70, A106AC: 70, A107AC: 32, A108AC: 32,
  A201AC: 70, A202AC: 70, A203AC: 70, A204AC: 70, A205AC: 70, A206AC: 70, A207AC: 32, A208AC: 32,
  A301AC: 70, A302AC: 70, A303AC: 70, A304AC: 70, A305AC: 70, A306AC: 70, A307AC: 32, A308AC: 32,
  S201AD: 48, S202AD: 44, S203AD: 38, S301AD: 48, S302AD: 44, S303AD: 38,
  S101II: 40, S102II: 45, S103II: 45,
  S101ExIM: 35, S102ExIM: 20, S103ExIM: 42,
  A101EG: 90, S204EG: 45, S205EG: 60, S206EG: 60, S208EG: 60, S209EG: 60,
  S210EG: 60, S211EG: 60, S212EG: 60, S213EG: 60,
};

describe("ICINF institutional classroom seed", () => {
  it("contains only the 56 approved classrooms and their source capacities", () => {
    expect(datosSalas).toHaveLength(56);
    expect(Object.fromEntries(datosSalas.map(sala => [sala.nombre, sala.capacidad]))).toEqual(capacidadesEsperadas);
    expect(datosSalas.every(sala => sala.tipo === "Sala" && Number.isInteger(sala.capacidad) && sala.capacidad > 0)).toBe(true);
    expect(new Set(datosSalas.map(sala => normalizarCodigoSala(sala.nombre))).size).toBe(56);
  });

  it("keeps planning fixtures linked to seeded classrooms", () => {
    for (const horario of datosPlanificacionHorarios) {
      expect(datosSalas.find(sala => sala.nombre === horario.sala)).toMatchObject({ tipo: "Sala" });
    }
  });
});
