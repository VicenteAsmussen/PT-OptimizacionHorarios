import { pgTable, serial, integer, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ofertasAsignaturas } from "./ofertas-asignaturas.schema.js";
import { salas } from "./salas.schema.js";
import { bloquesHorarios } from "./bloques-horarios.schema.js";
import { tiposHora } from "./tipos-hora.schema.js";
import { planificacionesSemestres } from "./planificaciones-semestres.schema.js";
import { ofertaTipoHora } from "./oferta-tipo-hora.schema.js";

export const horariosAsignaturas = pgTable("horarios_asignaturas", {
  id: serial("id").primaryKey(),
  ofertaId: integer("oferta_id").notNull(),
  salaId: integer("sala_id").references(() => salas.id, { onDelete: "restrict" }),
  bloqueId: integer("bloque_id").notNull().references(() => bloquesHorarios.id, { onDelete: "restrict" }),
  tipoHoraId: integer("tipo_hora_id").notNull(),
  planificacionSemestreId: integer("planificacion_semestre_id").notNull().references(() => planificacionesSemestres.id, { onDelete: "cascade" }),
}, (tabla) => [
  foreignKey({ name: "fk_horarios_oferta_planificacion", columns: [tabla.ofertaId, tabla.planificacionSemestreId], foreignColumns: [ofertasAsignaturas.id, ofertasAsignaturas.planificacionSemestreId] }).onDelete("cascade"),
  foreignKey({ name: "fk_horarios_asignacion_docente", columns: [tabla.ofertaId, tabla.tipoHoraId], foreignColumns: [ofertaTipoHora.ofertaId, ofertaTipoHora.tipoHoraId] }).onDelete("no action"),
  uniqueIndex("uq_horarios_planificacion_bloque_sala").on(tabla.planificacionSemestreId, tabla.bloqueId, tabla.salaId),
]);

export const horariosAsignaturasRelations = relations(horariosAsignaturas, ({ one }) => ({
  oferta: one(ofertasAsignaturas, { fields: [horariosAsignaturas.ofertaId, horariosAsignaturas.planificacionSemestreId], references: [ofertasAsignaturas.id, ofertasAsignaturas.planificacionSemestreId] }),
  sala: one(salas, { fields: [horariosAsignaturas.salaId], references: [salas.id] }),
  bloque: one(bloquesHorarios, { fields: [horariosAsignaturas.bloqueId], references: [bloquesHorarios.id] }),
  tipoHora: one(tiposHora, { fields: [horariosAsignaturas.tipoHoraId], references: [tiposHora.id] }),
  asignacion: one(ofertaTipoHora, { fields: [horariosAsignaturas.ofertaId, horariosAsignaturas.tipoHoraId], references: [ofertaTipoHora.ofertaId, ofertaTipoHora.tipoHoraId] }),
  planificacionSemestre: one(planificacionesSemestres, { fields: [horariosAsignaturas.planificacionSemestreId], references: [planificacionesSemestres.id] }),
}));
export type HorarioAsignatura = typeof horariosAsignaturas.$inferSelect;
export type NuevoHorarioAsignatura = typeof horariosAsignaturas.$inferInsert;
