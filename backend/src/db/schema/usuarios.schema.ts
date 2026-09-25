import { pgTable, serial, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { profesores } from "./profesores.schema.js";
import { carreras } from "./departamentos.schema.js";

export const rolUsuarioEnum = pgEnum("rol_usuario", ["secretaria", "profesor", "admin"]);

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  correo: text("correo").notNull().unique(),
  clave: text("clave").notNull(),
  rol: rolUsuarioEnum("rol").notNull().default("secretaria"),
  creadoEn: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

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

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;
export type Secretaria = typeof secretarias.$inferSelect;
export type NuevaSecretaria = typeof secretarias.$inferInsert;
