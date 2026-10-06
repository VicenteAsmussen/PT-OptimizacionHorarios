import { pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { disponibilidadProfesores } from "./disponibilidad-profesores.schema.js";
import { horariosAsignaturas } from "./horarios-asignaturas.schema.js";

export const bloquesHorarios = pgTable("bloques_horarios", {
  id: serial("id").primaryKey(),
  dia: varchar("dia", { length: 15 }).notNull(), // e.g. "Lunes", "Martes"
  horaInicio: varchar("hora_inicio", { length: 10 }).notNull(), // e.g. "08:15"
  horaTermino: varchar("hora_termino", { length: 10 }).notNull(), // e.g. "09:45"
});

export const bloquesHorariosRelations = relations(bloquesHorarios, ({ many }) => ({
  disponibilidades: many(disponibilidadProfesores),
  horarios: many(horariosAsignaturas),
}));

export type BloqueHorario = typeof bloquesHorarios.$inferSelect;
export type NuevoBloqueHorario = typeof bloquesHorarios.$inferInsert;
