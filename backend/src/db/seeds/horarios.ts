import { eq } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import type { BaseDatosSeed } from "./contexto.js";
import { datosBloques, datosSalas, dias, modulos } from "./data/horarios.js";

async function asegurarBloques(baseDatos: BaseDatosSeed) {
  for (const bloque of datosBloques) {
    await baseDatos
      .insert(esquema.bloquesHorarios)
      .values(bloque)
      .onConflictDoUpdate({
        target: [esquema.bloquesHorarios.dia, esquema.bloquesHorarios.numeroBloque],
        set: {
          horaInicio: bloque.horaInicio,
          horaTermino: bloque.horaTermino,
        },
      });
  }
}

async function asegurarSala(baseDatos: BaseDatosSeed, sala: typeof datosSalas[number]) {
  const [existente] = await baseDatos.select().from(esquema.salas).where(eq(esquema.salas.nombre, sala.nombre)).limit(1);
  if (existente) {
    const [actualizada] = await baseDatos
      .update(esquema.salas)
      .set({ capacidad: sala.capacidad, tipo: sala.tipo })
      .where(eq(esquema.salas.id, existente.id))
      .returning();
    return actualizada;
  }
  const [insertada] = await baseDatos.insert(esquema.salas).values(sala).returning();
  return insertada;
}

export async function sembrarHorarios(baseDatos: BaseDatosSeed) {
  await asegurarBloques(baseDatos);
  console.log(`✓ Asegurados ${datosBloques.length} bloques horarios (${modulos.length} módulos por ${dias.length} días)`);

  const salasAseguradas = [];
  for (const sala of datosSalas) salasAseguradas.push(await asegurarSala(baseDatos, sala));
  console.log(`✓ Aseguradas ${salasAseguradas.length} salas`);
}
