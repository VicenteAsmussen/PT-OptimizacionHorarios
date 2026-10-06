import { pgTable, serial, integer, uniqueIndex, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ofertasAsignaturas } from "./planificacion.schema.js";
import { salas, bloquesHorarios, tiposHora, semestres } from "./recursos.schema.js";

import { semestresHorarios } from "./semestres-horarios.schema.js";

export const horariosAsignaturas = pgTable(
  "horarios_asignaturas",
  {
    id: serial("id").primaryKey(),
    ofertaId: integer("oferta_id")
      .notNull()
      .references(() => ofertasAsignaturas.id, { onDelete: "cascade" }),
    salaId: integer("sala_id")
      .references(() => salas.id, { onDelete: "restrict" }),
    bloqueId: integer("bloque_id")
      .notNull()
      .references(() => bloquesHorarios.id, { onDelete: "restrict" }),
    tipoHoraId: integer("tipo_hora_id")
      .notNull()
      .references(() => tiposHora.id, { onDelete: "restrict" }),
    semestreId: integer("semestre_id")
      .notNull()
      .references(() => semestres.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("uq_horarios_asignaturas_id_semestre").on(table.id, table.semestreId),
    uniqueIndex("uq_horarios_semestre_bloque_sala").on(
      table.semestreId,
      table.bloqueId,
      table.salaId
    ),
  ]
);

export const horariosAsignaturasRelations = relations(horariosAsignaturas, ({ one }) => ({
  publicacion: one(semestresHorarios),
  oferta: one(ofertasAsignaturas, {
    fields: [horariosAsignaturas.ofertaId],
    references: [ofertasAsignaturas.id],
  }),
  sala: one(salas, {
    fields: [horariosAsignaturas.salaId],
    references: [salas.id],
  }),
  bloque: one(bloquesHorarios, {
    fields: [horariosAsignaturas.bloqueId],
    references: [bloquesHorarios.id],
  }),
  tipoHora: one(tiposHora, {
    fields: [horariosAsignaturas.tipoHoraId],
    references: [tiposHora.id],
  }),
  semestre: one(semestres, {
    fields: [horariosAsignaturas.semestreId],
    references: [semestres.id],
  }),
}));

export type HorarioAsignatura = typeof horariosAsignaturas.$inferSelect;
export type NuevoHorarioAsignatura = typeof horariosAsignaturas.$inferInsert;
