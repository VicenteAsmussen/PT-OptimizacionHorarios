import { pgTable, serial, text, varchar, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { profesores } from "./profesores.schema.js";
import { secretarias } from "./secretarias.schema.js";

export const rolUsuarioEnum = pgEnum("rol_usuario", ["secretaria", "profesor", "admin"]);

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  correo: varchar("correo", { length: 254 }).notNull().unique(),
  clave: text("clave").notNull(),
  rol: rolUsuarioEnum("rol").notNull().default("secretaria"),
  creadoEn: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const usuariosRelations = relations(usuarios, ({ one }) => ({
  profesor: one(profesores, {
    fields: [usuarios.id],
    references: [profesores.usuarioId],
  }),
  secretaria: one(secretarias, {
    fields: [usuarios.id],
    references: [secretarias.usuarioId],
  }),
}));

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;
