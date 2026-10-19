import { pgTable, serial, integer, varchar, boolean, unique, uniqueIndex, check } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { carreras } from "./carreras.schema.js";

export const planificacionesSemestres = pgTable("planificaciones_semestres", {
  id: serial("id").primaryKey(),
  carreraId: integer("carrera_id").notNull().references(() => carreras.id, { onDelete: "restrict" }),
  codigo: varchar("codigo", { length: 20 }).notNull(),
  anio: integer("anio").notNull(),
  actual: boolean("actual").notNull().default(false),
  estadoPlanificacion: varchar("estado_planificacion", { length: 20, enum: ["preparacion", "propuesta", "publicado"] })
    .notNull().default("preparacion"),
}, (tabla) => [
  unique("planificaciones_semestres_carrera_codigo_unique").on(tabla.carreraId, tabla.codigo),
  uniqueIndex("planificaciones_semestres_carrera_actual_unique").on(tabla.carreraId).where(sql`${tabla.actual} = true`),
  check("planificaciones_semestres_estado_check", sql`${tabla.estadoPlanificacion} in ('preparacion', 'propuesta', 'publicado')`),
]);

export const planificacionesSemestresRelations = relations(planificacionesSemestres, ({ one }) => ({
  carrera: one(carreras, {
    fields: [planificacionesSemestres.carreraId],
    references: [carreras.id],
  }),
}));

export type PlanificacionSemestre = typeof planificacionesSemestres.$inferSelect;
export type NuevaPlanificacionSemestre = typeof planificacionesSemestres.$inferInsert;
