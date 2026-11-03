import { integer, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { carreras } from "./carreras.schema.js";
import { bloquesHorarios } from "./bloques-horarios.schema.js";

export const bloquesReservados = pgTable(
  "bloques_reservados",
  {
    carreraId: integer("carrera_id")
      .notNull()
      .references(() => carreras.id, { onDelete: "cascade" }),
    bloqueHorarioId: integer("bloque_horario_id")
      .notNull()
      .references(() => bloquesHorarios.id, { onDelete: "cascade" }),
  },
  (tabla) => [
    primaryKey({ columns: [tabla.carreraId, tabla.bloqueHorarioId] }),
  ]
);

export const bloquesReservadosRelations = relations(bloquesReservados, ({ one }) => ({
  carrera: one(carreras, {
    fields: [bloquesReservados.carreraId],
    references: [carreras.id],
  }),
  bloqueHorario: one(bloquesHorarios, {
    fields: [bloquesReservados.bloqueHorarioId],
    references: [bloquesHorarios.id],
  }),
}));

export type BloqueReservado = typeof bloquesReservados.$inferSelect;
export type NuevoBloqueReservado = typeof bloquesReservados.$inferInsert;
