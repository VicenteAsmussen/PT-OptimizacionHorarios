import { pgTable, varchar, text, integer, boolean, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { carreras } from "./departamentos.schema.js";
import { ofertasAsignaturas } from "./planificacion.schema.js";

export const asignaturas = pgTable("asignaturas", {
  codigo: varchar("codigo", { length: 20 }).primaryKey(),
  nombre: text("nombre").notNull(),
  horasTeoria: integer("horas_teoria").notNull().default(0),
  horasPractica: integer("horas_practica").notNull().default(0),
  horasLab: integer("horas_lab").notNull().default(0),
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

export const asignaturasRelations = relations(asignaturas, ({ many }) => ({
  carreraAsignaturas: many(carreraAsignatura),
  ofertas: many(ofertasAsignaturas),
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

export type Asignatura = typeof asignaturas.$inferSelect;
export type NuevaAsignatura = typeof asignaturas.$inferInsert;
export type CarreraAsignatura = typeof carreraAsignatura.$inferSelect;
export type NuevaCarreraAsignatura = typeof carreraAsignatura.$inferInsert;
