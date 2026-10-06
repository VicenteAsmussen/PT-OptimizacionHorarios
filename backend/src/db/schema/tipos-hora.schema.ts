import { pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { horariosAsignaturas } from "./horarios-asignaturas.schema.js";
import { asignaturaTipoHora } from "./asignatura-tipo-hora.schema.js";

export const tiposHora = pgTable("tipos_hora", {
  id: serial("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }).notNull(), // e.g. "Cátedra", "Práctica", "Laboratorio"
});

export const tiposHoraRelations = relations(tiposHora, ({ many }) => ({
  horarios: many(horariosAsignaturas),
  asignaturas: many(asignaturaTipoHora),
}));

export type TipoHora = typeof tiposHora.$inferSelect;
export type NuevoTipoHora = typeof tiposHora.$inferInsert;
