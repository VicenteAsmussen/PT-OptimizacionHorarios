import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { horariosAsignaturas } from "./horarios-asignaturas.schema.js";

export const salas = pgTable("salas", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  capacidad: integer("capacidad").notNull(),
  tipo: text("tipo").notNull(), // e.g. "Sala de Clases", "Laboratorio de Computación"
});

export const salasRelations = relations(salas, ({ many }) => ({
  horarios: many(horariosAsignaturas),
}));

export type Sala = typeof salas.$inferSelect;
export type NuevaSala = typeof salas.$inferInsert;
