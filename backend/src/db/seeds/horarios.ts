import { and, eq } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import type { BaseDatosSeed } from "./contexto.js";
import { datosBloques, datosBloquesReservados, datosSalas, dias, modulos } from "./data/horarios.js";

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

export async function sembrarBloquesReservados(baseDatos: BaseDatosSeed) {
  const reservas: esquema.NuevoBloqueReservado[] = [];
  for (const dato of datosBloquesReservados) {
    const [carrera] = await baseDatos.select().from(esquema.carreras)
      .where(eq(esquema.carreras.nombre, dato.carrera)).limit(1);
    if (!carrera) throw new Error(`Carrera del bloque reservado inexistente: ${dato.carrera}`);
    const [bloque] = await baseDatos.select().from(esquema.bloquesHorarios)
      .where(and(eq(esquema.bloquesHorarios.dia, dato.dia), eq(esquema.bloquesHorarios.numeroBloque, dato.numeroBloque))).limit(1);
    if (!bloque) throw new Error(`Bloque reservado inexistente: ${dato.dia} B${dato.numeroBloque}`);
    reservas.push({ carreraId: carrera.id, bloqueHorarioId: bloque.id });
  }
  for (const reserva of reservas) {
    await baseDatos.insert(esquema.bloquesReservados).values(reserva).onConflictDoNothing();
  }
}

export async function sembrarHorarios(baseDatos: BaseDatosSeed) {
  await asegurarBloques(baseDatos);
  console.log(`✓ Asegurados ${datosBloques.length} bloques horarios (${modulos.length} módulos por ${dias.length} días)`);

  const salasAseguradas = [];
  for (const sala of datosSalas) salasAseguradas.push(await asegurarSala(baseDatos, sala));
  console.log(`✓ Aseguradas ${salasAseguradas.length} salas`);

  await sembrarBloquesReservados(baseDatos);
}
