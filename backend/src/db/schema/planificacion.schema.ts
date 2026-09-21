import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { asignaturas } from "./asignaturas.schema.js";
import { profesores } from "./profesores.schema.js";
import { semestres, bloquesHorarios } from "./recursos.schema.js";
import { horariosAsignaturas } from "./horarios.schema.js";

export const ofertasAsignaturas = pgTable("ofertas_asignaturas", {
  id: serial("id").primaryKey(),
  asignaturaCodigo: varchar("asignatura_codigo", { length: 20 })
    .notNull()
    .references(() => asignaturas.codigo, { onDelete: "restrict" }),
  profesorId: integer("profesor_id")
    .notNull()
    .references(() => profesores.id, { onDelete: "restrict" }),
  semestreId: integer("semestre_id")
    .notNull()
    .references(() => semestres.id, { onDelete: "cascade" }),
  seccion: integer("seccion").notNull().default(1),
  cupos: integer("cupos").notNull().default(0),
});

export const disponibilidadProfesores = pgTable("disponibilidad_profesores", {
  id: serial("id").primaryKey(),
  profesorId: integer("profesor_id")
    .notNull()
    .references(() => profesores.id, { onDelete: "cascade" }),
  semestreId: integer("semestre_id")
    .notNull()
    .references(() => semestres.id, { onDelete: "cascade" }),
  bloqueId: integer("bloque_id")
    .notNull()
    .references(() => bloquesHorarios.id, { onDelete: "cascade" }),
});

export const ofertasAsignaturasRelations = relations(ofertasAsignaturas, ({ one, many }) => ({
  asignatura: one(asignaturas, {
    fields: [ofertasAsignaturas.asignaturaCodigo],
    references: [asignaturas.codigo],
  }),
  profesor: one(profesores, {
    fields: [ofertasAsignaturas.profesorId],
    references: [profesores.id],
  }),
  semestre: one(semestres, {
    fields: [ofertasAsignaturas.semestreId],
    references: [semestres.id],
  }),
  horarios: many(horariosAsignaturas),
}));

export const disponibilidadProfesoresRelations = relations(disponibilidadProfesores, ({ one }) => ({
  profesor: one(profesores, {
    fields: [disponibilidadProfesores.profesorId],
    references: [profesores.id],
  }),
  semestre: one(semestres, {
    fields: [disponibilidadProfesores.semestreId],
    references: [semestres.id],
  }),
  bloque: one(bloquesHorarios, {
    fields: [disponibilidadProfesores.bloqueId],
    references: [bloquesHorarios.id],
  }),
}));

export type OfertaAsignatura = typeof ofertasAsignaturas.$inferSelect;
export type NuevaOfertaAsignatura = typeof ofertasAsignaturas.$inferInsert;
export type DisponibilidadProfesor = typeof disponibilidadProfesores.$inferSelect;
export type NuevaDisponibilidadProfesor = typeof disponibilidadProfesores.$inferInsert;
