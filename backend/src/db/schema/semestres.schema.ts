import { pgTable, serial, varchar, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ofertasAsignaturas } from "./ofertas-asignaturas.schema.js";
import { disponibilidadProfesores } from "./disponibilidad-profesores.schema.js";
import { horariosAsignaturas } from "./horarios-asignaturas.schema.js";
import { semestresHorarios } from "./semestres-horarios.schema.js";

export const semestres = pgTable("semestres", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(), // e.g. "2026-1"
  anio: integer("anio").notNull(),
  actual: boolean("actual").notNull().default(false),
});

export const semestresRelations = relations(semestres, ({ many }) => ({
  publicaciones: many(semestresHorarios),
  ofertas: many(ofertasAsignaturas),
  disponibilidades: many(disponibilidadProfesores),
  horarios: many(horariosAsignaturas),
}));

export type Semestre = typeof semestres.$inferSelect;
export type NuevoSemestre = typeof semestres.$inferInsert;
