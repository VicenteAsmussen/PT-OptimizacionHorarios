import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { profesores } from "./profesores.schema.js";
import { semestres } from "./semestres.schema.js";
import { bloquesHorarios } from "./bloques-horarios.schema.js";

export const disponibilidadProfesores = pgTable("disponibilidad_profesores", {
  id: serial("id").primaryKey(),
  profesorId: integer("profesor_id")
    .notNull()
    .references(() => profesores.id, { onDelete: "cascade" }),
  semestreId: integer("semestre_id")
    .notNull()
    .references(() => semestres.id, { onDelete: "cascade" }),
  bloqueId: integer("bloque_id")
    .notNull()
    .references(() => bloquesHorarios.id, { onDelete: "cascade" }),
});

export const disponibilidadProfesoresRelations = relations(disponibilidadProfesores, ({ one }) => ({
  profesor: one(profesores, {
    fields: [disponibilidadProfesores.profesorId],
    references: [profesores.id],
  }),
  semestre: one(semestres, {
    fields: [disponibilidadProfesores.semestreId],
    references: [semestres.id],
  }),
  bloque: one(bloquesHorarios, {
    fields: [disponibilidadProfesores.bloqueId],
    references: [bloquesHorarios.id],
  }),
}));

export type DisponibilidadProfesor = typeof disponibilidadProfesores.$inferSelect;
export type NuevaDisponibilidadProfesor = typeof disponibilidadProfesores.$inferInsert;
