import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usuarios } from "./usuarios.schema.js";

export const sesiones = pgTable("sesiones", {
  id: varchar("id", { length: 64 }).primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
}, (tabla) => [index("sesiones_usuario_id_idx").on(tabla.usuarioId)]);

export const sesionesRelations = relations(sesiones, ({ one }) => ({
  usuario: one(usuarios, { fields: [sesiones.usuarioId], references: [usuarios.id] }),
}));

export type Sesion = typeof sesiones.$inferSelect;
export type NuevaSesion = typeof sesiones.$inferInsert;
