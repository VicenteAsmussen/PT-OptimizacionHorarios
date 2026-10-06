import { pgTable, varchar, integer, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { carreras } from "./carreras.schema.js";
import { asignaturas } from "./asignaturas.schema.js";

export const carreraAsignatura = pgTable(
  "carrera_asignatura",
  {
    carreraId: integer("carrera_id")
      .notNull()
      .references(() => carreras.id, { onDelete: "cascade" }),
    asignaturaCodigo: varchar("asignatura_codigo", { length: 20 })
      .notNull()
      .references(() => asignaturas.codigo, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.carreraId, table.asignaturaCodigo] }),
  ]
);

export const carreraAsignaturaRelations = relations(carreraAsignatura, ({ one }) => ({
  carrera: one(carreras, {
    fields: [carreraAsignatura.carreraId],
    references: [carreras.id],
  }),
  asignatura: one(asignaturas, {
    fields: [carreraAsignatura.asignaturaCodigo],
    references: [asignaturas.codigo],
  }),
}));

export type CarreraAsignatura = typeof carreraAsignatura.$inferSelect;
export type NuevaCarreraAsignatura = typeof carreraAsignatura.$inferInsert;
