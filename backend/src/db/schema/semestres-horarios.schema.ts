import { pgTable, integer, boolean, foreignKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { semestres } from "./semestres.schema.js";
import { horariosAsignaturas } from "./horarios-asignaturas.schema.js";

// One publication relation per entry; the composite FK enforces semester ownership.
export const semestresHorarios = pgTable("semestres_horarios", {
  semestreId: integer("semestre_id").notNull()
    .references(() => semestres.id, { onDelete: "cascade" }),
  horarioAsignaturaId: integer("horario_asignatura_id").primaryKey(),
  horarioPublicado: boolean("horario_publicado").notNull().default(false),
}, (table) => [
  foreignKey({
    name: "fk_semestres_horarios_entrada_semestre",
    columns: [table.horarioAsignaturaId, table.semestreId],
    foreignColumns: [horariosAsignaturas.id, horariosAsignaturas.semestreId],
  }).onDelete("cascade").onUpdate("cascade"),
]);

export const semestresHorariosRelations = relations(semestresHorarios, ({ one }) => ({
  semestre: one(semestres, {
    fields: [semestresHorarios.semestreId], references: [semestres.id],
  }),
  entrada: one(horariosAsignaturas, {
    fields: [semestresHorarios.horarioAsignaturaId, semestresHorarios.semestreId],
    references: [horariosAsignaturas.id, horariosAsignaturas.semestreId],
  }),
}));
