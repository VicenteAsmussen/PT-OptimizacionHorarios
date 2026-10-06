import { pgTable, varchar, integer, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { asignaturas } from "./asignaturas.schema.js";
import { tiposHora } from "./tipos-hora.schema.js";

export const asignaturaTipoHora = pgTable(
  "asignatura_tipo_hora",
  {
    asignaturaCodigo: varchar("asignatura_codigo", { length: 20 })
      .notNull()
      .references(() => asignaturas.codigo, { onDelete: "cascade" }),
    tipoHoraId: integer("tipo_hora_id")
      .notNull()
      .references(() => tiposHora.id, { onDelete: "cascade" }),
    horas: integer("horas").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.asignaturaCodigo, table.tipoHoraId] }),
  ]
);

export const asignaturaTipoHoraRelations = relations(asignaturaTipoHora, ({ one }) => ({
  asignatura: one(asignaturas, {
    fields: [asignaturaTipoHora.asignaturaCodigo],
    references: [asignaturas.codigo],
  }),
  tipoHora: one(tiposHora, {
    fields: [asignaturaTipoHora.tipoHoraId],
    references: [tiposHora.id],
  }),
}));

export type AsignaturaTipoHora = typeof asignaturaTipoHora.$inferSelect;
export type NuevaAsignaturaTipoHora = typeof asignaturaTipoHora.$inferInsert;
