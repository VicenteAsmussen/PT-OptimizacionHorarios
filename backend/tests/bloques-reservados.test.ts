import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("Bloques reservados por carrera", () => {
  it("identifica cada reserva por carrera y bloque, sin depender del período", async () => {
    const esquema = await import("../src/db/schema/index.js");
    expect(esquema).toHaveProperty("bloquesReservados");
    const tabla = getTableConfig(esquema.bloquesReservados);

    expect(tabla.name).toBe("bloques_reservados");
    expect(tabla.columns.map(columna => [columna.name, columna.notNull])).toEqual([
      ["carrera_id", true],
      ["bloque_horario_id", true],
    ]);
    expect(tabla.primaryKeys).toHaveLength(1);
    expect(tabla.primaryKeys[0].columns.map(columna => columna.name)).toEqual([
      "carrera_id", "bloque_horario_id",
    ]);
    expect(tabla.foreignKeys.map(clave => ({
      columna: clave.reference().columns[0].name,
      destino: getTableConfig(clave.reference().foreignTable).name,
      referencia: clave.reference().foreignColumns[0].name,
      alEliminar: clave.onDelete,
    }))).toEqual([
      { columna: "carrera_id", destino: "carreras", referencia: "id", alEliminar: "cascade" },
      { columna: "bloque_horario_id", destino: "bloques_horarios", referencia: "id", alEliminar: "cascade" },
    ]);
  });
});
