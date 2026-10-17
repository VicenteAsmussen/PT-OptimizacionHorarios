import { pgTable, serial, text, varchar, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usuarios } from "./usuarios.schema.js";
import { departamentos } from "./departamentos.schema.js";
import { ofertasAsignaturas } from "./ofertas-asignaturas.schema.js";
import { disponibilidadProfesores } from "./disponibilidad-profesores.schema.js";

export const profesores = pgTable("profesores", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  departamentoId: integer("departamento_id")
    .notNull()
    .references(() => departamentos.id, { onDelete: "restrict" }),
  rut: text("rut").notNull().unique("profesores_rut_unique"),
  nombre: varchar("nombre", { length: 100 }).notNull(),
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

// Proyección de relaciones existentes: agregar RUT al CRUD no amplía sus respuestas.
export const columnasProfesorSinRut = {
  id: true, usuarioId: true, departamentoId: true, nombre: true, tipo: true,
} as const;

export type Profesor = typeof profesores.$inferSelect;
export type NuevoProfesor = typeof profesores.$inferInsert;
