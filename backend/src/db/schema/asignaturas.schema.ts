import { pgTable, varchar, text, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { departamentos } from "./departamentos.schema.js";
import { carreraAsignatura } from "./carrera-asignatura.schema.js";
import { ofertasAsignaturas } from "./ofertas-asignaturas.schema.js";
import { asignaturaTipoHora } from "./asignatura-tipo-hora.schema.js";

export const asignaturas = pgTable("asignaturas", {
  codigo: varchar("codigo", { length: 20 }).primaryKey(),
  nombre: text("nombre").notNull(),
  departamentoId: integer("departamento_id").notNull().references(() => departamentos.id, { onDelete: "restrict" }),
  semestreMalla: integer("semestre_malla").notNull(),
  esCritica: boolean("es_critica").notNull().default(false),
});

export const asignaturasRelations = relations(asignaturas, ({ one, many }) => ({
  departamento: one(departamentos, { fields: [asignaturas.departamentoId], references: [departamentos.id] }),
  carreraAsignaturas: many(carreraAsignatura),
  ofertas: many(ofertasAsignaturas),
  tiposHora: many(asignaturaTipoHora),
}));

export type Asignatura = typeof asignaturas.$inferSelect;
export type NuevaAsignatura = typeof asignaturas.$inferInsert;
