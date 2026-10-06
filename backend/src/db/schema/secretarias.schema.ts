import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usuarios } from "./usuarios.schema.js";
import { carreras } from "./carreras.schema.js";

export const secretarias = pgTable("secretarias", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id")
    .notNull()
    .unique()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  carreraId: integer("carrera_id")
    .notNull()
    .references(() => carreras.id, { onDelete: "restrict" }),
});

export const secretariasRelations = relations(secretarias, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [secretarias.usuarioId],
    references: [usuarios.id],
  }),
  carrera: one(carreras, {
    fields: [secretarias.carreraId],
    references: [carreras.id],
  }),
}));

export type Secretaria = typeof secretarias.$inferSelect;
export type NuevaSecretaria = typeof secretarias.$inferInsert;
