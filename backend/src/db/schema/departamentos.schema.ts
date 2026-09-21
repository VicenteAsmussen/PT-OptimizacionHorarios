import { pgTable, serial, text, integer, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { profesores } from "./profesores.schema.js";
import { carreraAsignatura } from "./asignaturas.schema.js";

export const departamentos = pgTable("departamentos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
});

export const carreras = pgTable("carreras", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
});

export const carreraDepartamento = pgTable(
  "carrera_departamento",
  {
    carreraId: integer("carrera_id")
      .notNull()
      .references(() => carreras.id, { onDelete: "cascade" }),
    departamentoId: integer("departamento_id")
      .notNull()
      .references(() => departamentos.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.carreraId, table.departamentoId] }),
  ]
);

export const departamentosRelations = relations(departamentos, ({ many }) => ({
  profesores: many(profesores),
  carreraDepartamentos: many(carreraDepartamento),
}));

export const carrerasRelations = relations(carreras, ({ many }) => ({
  carreraDepartamentos: many(carreraDepartamento),
  carreraAsignaturas: many(carreraAsignatura),
}));

export const carreraDepartamentoRelations = relations(carreraDepartamento, ({ one }) => ({
  carrera: one(carreras, {
    fields: [carreraDepartamento.carreraId],
    references: [carreras.id],
  }),
  departamento: one(departamentos, {
    fields: [carreraDepartamento.departamentoId],
    references: [departamentos.id],
  }),
}));

export type Departamento = typeof departamentos.$inferSelect;
export type NuevoDepartamento = typeof departamentos.$inferInsert;
export type Carrera = typeof carreras.$inferSelect;
export type NuevaCarrera = typeof carreras.$inferInsert;
export type CarreraDepartamento = typeof carreraDepartamento.$inferSelect;
export type NuevaCarreraDepartamento = typeof carreraDepartamento.$inferInsert;
