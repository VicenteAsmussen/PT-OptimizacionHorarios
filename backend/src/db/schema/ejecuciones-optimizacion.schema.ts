import { relations, sql } from "drizzle-orm";
import { pgTable, uuid, integer, text, jsonb, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { planificacionesSemestres } from "./planificaciones-semestres.schema.js";

const estadosEjecucion = ["en_ejecucion", "aplicada", "infactible", "carga_incompleta", "limite_tiempo", "error", "interrumpida", "datos_desactualizados"] as const;

export const ejecucionesOptimizacion = pgTable("ejecuciones_optimizacion", {
  id: uuid("id").primaryKey(),
  planificacionSemestreId: integer("planificacion_semestre_id").notNull().references(() => planificacionesSemestres.id, { onDelete: "restrict" }),
  claveIdempotencia: text("clave_idempotencia").notNull(),
  revisionSolicitud: text("revision_solicitud").notNull(),
  revisionEntrada: text("revision_entrada").notNull(),
  versionModelo: text("version_modelo").notNull(),
  propietario: uuid("propietario").notNull(),
  estado: text("estado").$type<EstadoEjecucion>().notNull(),
  entrada: jsonb("entrada").$type<unknown>().notNull(),
  parametros: jsonb("parametros").$type<unknown>().notNull(),
  resultado: jsonb("resultado").$type<unknown>(),
  diagnostico: jsonb("diagnostico").$type<unknown>(),
  iniciadaEn: timestamp("iniciada_en", { withTimezone: true }).defaultNow().notNull(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
  vigenteHasta: timestamp("vigente_hasta", { withTimezone: true }).notNull(),
}, tabla => [
  uniqueIndex("uq_ejecucion_clave_planificacion").on(tabla.planificacionSemestreId, tabla.claveIdempotencia),
  uniqueIndex("uq_ejecucion_activa_planificacion").on(tabla.planificacionSemestreId).where(sql`${tabla.estado} = 'en_ejecucion'`),
  index("ix_ejecucion_ultima_planificacion").on(tabla.planificacionSemestreId, tabla.iniciadaEn),
  check("ck_ejecucion_estado", sql`${tabla.estado} in ('en_ejecucion', 'aplicada', 'infactible', 'carga_incompleta', 'limite_tiempo', 'error', 'interrumpida', 'datos_desactualizados')`),
]);
export const ejecucionesOptimizacionRelations = relations(ejecucionesOptimizacion, ({ one }) => ({
  planificacion: one(planificacionesSemestres, { fields: [ejecucionesOptimizacion.planificacionSemestreId], references: [planificacionesSemestres.id] }),
}));
export type EstadoEjecucion = typeof estadosEjecucion[number];
export type EjecucionOptimizacion = typeof ejecucionesOptimizacion.$inferSelect;
export type NuevaEjecucionOptimizacion = typeof ejecucionesOptimizacion.$inferInsert;
