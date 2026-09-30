import { pgTable, serial, text, varchar, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ofertasAsignaturas, disponibilidadProfesores } from "./planificacion.schema.js";
import { horariosAsignaturas } from "./horarios.schema.js";
import { asignaturaTipoHora } from "./asignaturas.schema.js";

export const semestres = pgTable("semestres", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(), // e.g. "2026-1"
  anio: integer("anio").notNull(),
  actual: boolean("actual").notNull().default(false),
  horarioPublicado: boolean("horario_publicado").notNull().default(false),
});

export const bloquesHorarios = pgTable("bloques_horarios", {
  id: serial("id").primaryKey(),
  dia: varchar("dia", { length: 15 }).notNull(), // e.g. "Lunes", "Martes"
  horaInicio: varchar("hora_inicio", { length: 10 }).notNull(), // e.g. "08:15"
  horaTermino: varchar("hora_termino", { length: 10 }).notNull(), // e.g. "09:45"
});

export const tiposHora = pgTable("tipos_hora", {
  id: serial("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }).notNull(), // e.g. "Cátedra", "Práctica", "Laboratorio"
});

export const salas = pgTable("salas", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  capacidad: integer("capacidad").notNull(),
  tipo: text("tipo").notNull(), // e.g. "Sala de Clases", "Laboratorio de Computación"
});

export const semestresRelations = relations(semestres, ({ many }) => ({
  ofertas: many(ofertasAsignaturas),
  disponibilidades: many(disponibilidadProfesores),
  horarios: many(horariosAsignaturas),
}));

export const bloquesHorariosRelations = relations(bloquesHorarios, ({ many }) => ({
  disponibilidades: many(disponibilidadProfesores),
  horarios: many(horariosAsignaturas),
}));

export const tiposHoraRelations = relations(tiposHora, ({ many }) => ({
  horarios: many(horariosAsignaturas),
  asignaturas: many(asignaturaTipoHora),
}));

export const salasRelations = relations(salas, ({ many }) => ({
  horarios: many(horariosAsignaturas),
}));

export type Semestre = typeof semestres.$inferSelect;
export type NuevoSemestre = typeof semestres.$inferInsert;
export type BloqueHorario = typeof bloquesHorarios.$inferSelect;
export type NuevoBloqueHorario = typeof bloquesHorarios.$inferInsert;
export type TipoHora = typeof tiposHora.$inferSelect;
export type NuevoTipoHora = typeof tiposHora.$inferInsert;
export type Sala = typeof salas.$inferSelect;
export type NuevaSala = typeof salas.$inferInsert;
