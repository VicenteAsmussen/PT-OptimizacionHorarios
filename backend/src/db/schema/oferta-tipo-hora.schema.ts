import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { ofertasAsignaturas } from "./ofertas-asignaturas.schema.js";
import { tiposHora } from "./tipos-hora.schema.js";
import { profesores } from "./profesores.schema.js";
import { horariosAsignaturas } from "./horarios-asignaturas.schema.js";

export const ofertaTipoHora = pgTable("oferta_tipo_hora", {
  ofertaId: integer("oferta_id").notNull().references(() => ofertasAsignaturas.id, { onDelete: "cascade" }),
  tipoHoraId: integer("tipo_hora_id").notNull().references(() => tiposHora.id, { onDelete: "restrict" }),
  profesorId: integer("profesor_id").notNull().references(() => profesores.id, { onDelete: "restrict" }),
}, tabla => [primaryKey({ columns: [tabla.ofertaId, tabla.tipoHoraId] })]);

export const ofertaTipoHoraRelations = relations(ofertaTipoHora, ({ one, many }) => ({
  oferta: one(ofertasAsignaturas, { fields: [ofertaTipoHora.ofertaId], references: [ofertasAsignaturas.id] }),
  tipoHora: one(tiposHora, { fields: [ofertaTipoHora.tipoHoraId], references: [tiposHora.id] }),
  profesor: one(profesores, { fields: [ofertaTipoHora.profesorId], references: [profesores.id] }),
  horarios: many(horariosAsignaturas),
}));
export type AsignacionDocente = typeof ofertaTipoHora.$inferSelect;
export type NuevaAsignacionDocente = typeof ofertaTipoHora.$inferInsert;
