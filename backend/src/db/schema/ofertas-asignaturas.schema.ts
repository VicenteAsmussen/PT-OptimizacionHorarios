import { pgTable, serial, varchar, integer, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { asignaturas } from "./asignaturas.schema.js";
import { ofertaTipoHora } from "./oferta-tipo-hora.schema.js";
import { planificacionesSemestres } from "./planificaciones-semestres.schema.js";
import { horariosAsignaturas } from "./horarios-asignaturas.schema.js";

export const ofertasAsignaturas = pgTable("ofertas_asignaturas", {
  id: serial("id").primaryKey(),
  asignaturaCodigo: varchar("asignatura_codigo", { length: 20 }).notNull().references(() => asignaturas.codigo, { onDelete: "restrict" }),
  planificacionSemestreId: integer("planificacion_semestre_id").notNull().references(() => planificacionesSemestres.id, { onDelete: "cascade" }),
  seccion: integer("seccion").notNull().default(1),
  cupos: integer("cupos").notNull().default(0),
}, (tabla) => [
  unique("uq_ofertas_id_planificacion").on(tabla.id, tabla.planificacionSemestreId),
  unique("uq_ofertas_planificacion_asignatura_seccion").on(tabla.planificacionSemestreId, tabla.asignaturaCodigo, tabla.seccion),
]);

export const ofertasAsignaturasRelations = relations(ofertasAsignaturas, ({ one, many }) => ({
  asignatura: one(asignaturas, { fields: [ofertasAsignaturas.asignaturaCodigo], references: [asignaturas.codigo] }),
  asignaciones: many(ofertaTipoHora),
  planificacionSemestre: one(planificacionesSemestres, { fields: [ofertasAsignaturas.planificacionSemestreId], references: [planificacionesSemestres.id] }),
  horarios: many(horariosAsignaturas),
}));
export type OfertaAsignatura = typeof ofertasAsignaturas.$inferSelect;
export type NuevaOfertaAsignatura = typeof ofertasAsignaturas.$inferInsert;
