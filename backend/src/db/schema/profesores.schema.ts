import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usuarios } from "./usuarios.schema.js";
import { departamentos } from "./departamentos.schema.js";
import { ofertasAsignaturas, disponibilidadProfesores } from "./planificacion.schema.js";

export const profesores = pgTable("profesores", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  departamentoId: integer("departamento_id")
    .notNull()
    .references(() => departamentos.id, { onDelete: "restrict" }),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(), // e.g. "Jornada Completa", "Media Jornada", "Part-Time"
});

export const profesoresRelations = relations(profesores, ({ one, many }) => ({
  usuario: one(usuarios, {
    fields: [profesores.usuarioId],
    references: [usuarios.id],
  }),
  departamento: one(departamentos, {
    fields: [profesores.departamentoId],
    references: [departamentos.id],
  }),
  ofertas: many(ofertasAsignaturas),
  disponibilidades: many(disponibilidadProfesores),
}));

export type Profesor = typeof profesores.$inferSelect;
export type NuevoProfesor = typeof profesores.$inferInsert;
