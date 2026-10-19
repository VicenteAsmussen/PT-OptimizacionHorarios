-- Reset acotado de desarrollo: la propiedad por carrera de los datos legacy es ambigua.
-- Vaciar solo publicaciones, entradas, ofertas y disponibilidad; preservar planificaciones y catalogos.
-- Ejecutar el seed despues de aplicar esta migracion para reconstruir los fixtures por carrera y periodo.
-- Generado con drizzle-kit/api en dos diffs (remociones y adiciones), sin inferir renombres.
-- Orden ajustado: quitar dependencias antes de tablas/columnas y crear UNIQUE antes de su FK.
DELETE FROM "semestres_horarios";
--> statement-breakpoint
DELETE FROM "horarios_asignaturas";
--> statement-breakpoint
DELETE FROM "ofertas_asignaturas";
--> statement-breakpoint
DELETE FROM "disponibilidad_profesores";
--> statement-breakpoint
DROP TABLE "semestres_horarios";
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" DROP CONSTRAINT "uq_horarios_asignaturas_id_semestre";
--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" DROP CONSTRAINT "disponibilidad_profesores_semestre_id_semestres_id_fk";
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" DROP CONSTRAINT "horarios_asignaturas_oferta_id_ofertas_asignaturas_id_fk";
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" DROP CONSTRAINT "horarios_asignaturas_semestre_id_semestres_id_fk";
--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" DROP CONSTRAINT "ofertas_asignaturas_semestre_id_semestres_id_fk";
--> statement-breakpoint
DROP INDEX "uq_horarios_semestre_bloque_sala";
--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" DROP COLUMN "semestre_id";
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" DROP COLUMN "semestre_id";
--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" DROP COLUMN "semestre_id";
--> statement-breakpoint
DROP TABLE "semestres";
--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" ADD COLUMN "planificacion_semestre_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" ADD COLUMN "planificacion_semestre_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD COLUMN "planificacion_semestre_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" ADD CONSTRAINT "uq_ofertas_id_planificacion" UNIQUE("id","planificacion_semestre_id");
--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" ADD CONSTRAINT "uq_ofertas_planificacion_asignatura_seccion" UNIQUE("planificacion_semestre_id","asignatura_codigo","seccion");
--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" ADD CONSTRAINT "uq_disponibilidad_profesor_planificacion_bloque" UNIQUE("profesor_id","planificacion_semestre_id","bloque_id");
--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" ADD CONSTRAINT "ofertas_asignaturas_planificacion_semestre_id_planificaciones_semestres_id_fk" FOREIGN KEY ("planificacion_semestre_id") REFERENCES "public"."planificaciones_semestres"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" ADD CONSTRAINT "disponibilidad_profesores_planificacion_semestre_id_planificaciones_semestres_id_fk" FOREIGN KEY ("planificacion_semestre_id") REFERENCES "public"."planificaciones_semestres"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "horarios_asignaturas_planificacion_semestre_id_planificaciones_semestres_id_fk" FOREIGN KEY ("planificacion_semestre_id") REFERENCES "public"."planificaciones_semestres"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "fk_horarios_oferta_planificacion" FOREIGN KEY ("oferta_id","planificacion_semestre_id") REFERENCES "public"."ofertas_asignaturas"("id","planificacion_semestre_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_horarios_planificacion_bloque_sala" ON "horarios_asignaturas" USING btree ("planificacion_semestre_id","bloque_id","sala_id");
