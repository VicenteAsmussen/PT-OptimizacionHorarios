import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { profesores } from "./profesores.schema.js";
import { carreraDepartamento } from "./carrera-departamento.schema.js";

export const departamentos = pgTable("departamentos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
});

export const departamentosRelations = relations(departamentos, ({ many }) => ({
  profesores: many(profesores),
  carreraDepartamentos: many(carreraDepartamento),
}));

export type Departamento = typeof departamentos.$inferSelect;
export type NuevoDepartamento = typeof departamentos.$inferInsert;
