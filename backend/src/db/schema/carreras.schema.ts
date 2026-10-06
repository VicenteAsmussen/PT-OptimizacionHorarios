import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { carreraDepartamento } from "./carrera-departamento.schema.js";
import { carreraAsignatura } from "./carrera-asignatura.schema.js";
import { secretarias } from "./secretarias.schema.js";

export const carreras = pgTable("carreras", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
});

export const carrerasRelations = relations(carreras, ({ many }) => ({
  carreraDepartamentos: many(carreraDepartamento),
  carreraAsignaturas: many(carreraAsignatura),
  secretarias: many(secretarias),
}));

export type Carrera = typeof carreras.$inferSelect;
export type NuevaCarrera = typeof carreras.$inferInsert;
