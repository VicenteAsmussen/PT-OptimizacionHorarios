import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import * as esquema from "../src/db/schema/index.js";
import * as horariosSeed from "../src/db/seeds/horarios.js";
import type { BaseDatosSeed } from "../src/db/seeds/contexto.js";

function prepararBase() {
  const carreras = [
    { id: 37, nombre: "Ingeniería Civil en Informática" },
    { id: 91, nombre: "Otra carrera" },
  ];
  const bloques = [
    { id: 205, dia: "Martes", numeroBloque: 5 },
    { id: 206, dia: "Martes", numeroBloque: 6 },
  ];
  const reservas = [{ carreraId: 91, bloqueHorarioId: 205 }];
  const dialecto = new PgDialect();
  const base = {
    select: vi.fn(() => ({
      from: (tabla: unknown) => ({
        where: (condicion: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
          limit: async () => {
            const { params } = dialecto.sqlToQuery(condicion);
            if (tabla === esquema.carreras) return carreras.filter(carrera => carrera.nombre === params[0]);
            if (tabla === esquema.bloquesHorarios) return bloques.filter(bloque => bloque.dia === params[0] && bloque.numeroBloque === params[1]);
            throw new Error("Consulta fuera del alcance de reservas");
          },
        }),
      }),
    })),
    insert: vi.fn((tabla: unknown) => {
      expect(tabla).toBe(esquema.bloquesReservados);
      return {
        values: (reserva: typeof reservas[number]) => ({
          onConflictDoNothing: async () => {
            if (!reservas.some(existente => existente.carreraId === reserva.carreraId && existente.bloqueHorarioId === reserva.bloqueHorarioId)) {
              reservas.push(reserva);
            }
          },
        }),
      };
    }),
  };
  return { base: base as unknown as BaseDatosSeed, carreras, bloques, reservas };
}

describe("Seed de bloques reservados de ICINF", () => {
  it("resuelve martes B5/B6 por identidad y repite sin duplicar ni quitar reservas ajenas", async () => {
    expect(horariosSeed).toHaveProperty("sembrarBloquesReservados");
    const { base, reservas } = prepararBase();
    await horariosSeed.sembrarBloquesReservados(base);
    await horariosSeed.sembrarBloquesReservados(base);
    expect(reservas).toEqual([
      { carreraId: 91, bloqueHorarioId: 205 },
      { carreraId: 37, bloqueHorarioId: 205 },
      { carreraId: 37, bloqueHorarioId: 206 },
    ]);
  });

  it("rechaza un catálogo incompleto en lugar de omitir la reserva", async () => {
    expect(horariosSeed).toHaveProperty("sembrarBloquesReservados");
    const { base, carreras } = prepararBase();
    carreras.length = 0;
    await expect(horariosSeed.sembrarBloquesReservados(base)).rejects.toThrow("Carrera del bloque reservado inexistente");
    expect(base.insert).not.toHaveBeenCalled();
    const incompleta = prepararBase();
    incompleta.bloques.pop();
    await expect(horariosSeed.sembrarBloquesReservados(incompleta.base)).rejects.toThrow("Bloque reservado inexistente: Martes B6");
    expect(incompleta.base.insert).not.toHaveBeenCalled();
  });
});
