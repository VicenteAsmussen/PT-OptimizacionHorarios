import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { carreras } from "./carreras.schema.js";
import { departamentos } from "./departamentos.schema.js";

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

export type CarreraDepartamento = typeof carreraDepartamento.$inferSelect;
export type NuevaCarreraDepartamento = typeof carreraDepartamento.$inferInsert;
