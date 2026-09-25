import { pgTable, varchar, text, integer, boolean, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { carreras } from "./departamentos.schema.js";
import { ofertasAsignaturas } from "./planificacion.schema.js";
import { tiposHora } from "./recursos.schema.js";

export const asignaturas = pgTable("asignaturas", {
  codigo: varchar("codigo", { length: 20 }).primaryKey(),
  nombre: text("nombre").notNull(),
  semestreMalla: integer("semestre_malla").notNull(),
  esCritica: boolean("es_critica").notNull().default(false),
});

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

export const asignaturasRelations = relations(asignaturas, ({ many }) => ({
  carreraAsignaturas: many(carreraAsignatura),
  ofertas: many(ofertasAsignaturas),
  tiposHora: many(asignaturaTipoHora),
}));

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

export type Asignatura = typeof asignaturas.$inferSelect;
export type NuevaAsignatura = typeof asignaturas.$inferInsert;
export type CarreraAsignatura = typeof carreraAsignatura.$inferSelect;
export type NuevaCarreraAsignatura = typeof carreraAsignatura.$inferInsert;
export type AsignaturaTipoHora = typeof asignaturaTipoHora.$inferSelect;
export type NuevaAsignaturaTipoHora = typeof asignaturaTipoHora.$inferInsert;
