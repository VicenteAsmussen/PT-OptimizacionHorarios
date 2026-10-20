import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { profesores } from "./profesores.schema.js";
import { planificacionesSemestres } from "./planificaciones-semestres.schema.js";
import { bloquesHorarios } from "./bloques-horarios.schema.js";

export const disponibilidadProfesores = pgTable("disponibilidad_profesores", {
  id: serial("id").primaryKey(),
  profesorId: integer("profesor_id").notNull().references(() => profesores.id, { onDelete: "cascade" }),
  planificacionSemestreId: integer("planificacion_semestre_id").notNull().references(() => planificacionesSemestres.id, { onDelete: "cascade" }),
  bloqueId: integer("bloque_id").notNull().references(() => bloquesHorarios.id, { onDelete: "cascade" }),
}, (tabla) => [unique("uq_disponibilidad_profesor_planificacion_bloque").on(tabla.profesorId, tabla.planificacionSemestreId, tabla.bloqueId)]);
export const disponibilidadProfesoresRelations = relations(disponibilidadProfesores, ({ one }) => ({
  profesor: one(profesores, { fields: [disponibilidadProfesores.profesorId], references: [profesores.id] }),
  planificacionSemestre: one(planificacionesSemestres, { fields: [disponibilidadProfesores.planificacionSemestreId], references: [planificacionesSemestres.id] }),
  bloque: one(bloquesHorarios, { fields: [disponibilidadProfesores.bloqueId], references: [bloquesHorarios.id] }),
}));
export type DisponibilidadProfesor = typeof disponibilidadProfesores.$inferSelect;
export type NuevaDisponibilidadProfesor = typeof disponibilidadProfesores.$inferInsert;
