CREATE TABLE "planificaciones_semestres" (
	"id" serial PRIMARY KEY NOT NULL,
	"carrera_id" integer NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"anio" integer NOT NULL,
	"actual" boolean DEFAULT false NOT NULL,
	"estado_planificacion" varchar(20) DEFAULT 'preparacion' NOT NULL,
	CONSTRAINT "planificaciones_semestres_carrera_codigo_unique" UNIQUE("carrera_id","codigo"),
	CONSTRAINT "planificaciones_semestres_estado_check" CHECK ("planificaciones_semestres"."estado_planificacion" in ('preparacion', 'propuesta', 'publicado'))
);
--> statement-breakpoint
ALTER TABLE "planificaciones_semestres" ADD CONSTRAINT "planificaciones_semestres_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planificaciones_semestres_carrera_actual_unique" ON "planificaciones_semestres" USING btree ("carrera_id") WHERE "planificaciones_semestres"."actual" = true;