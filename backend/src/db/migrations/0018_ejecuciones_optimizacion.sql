CREATE TABLE "ejecuciones_optimizacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"planificacion_semestre_id" integer NOT NULL,
	"clave_idempotencia" text NOT NULL,
	"revision_solicitud" text NOT NULL,
	"revision_entrada" text NOT NULL,
	"version_modelo" text NOT NULL,
	"propietario" uuid NOT NULL,
	"estado" text NOT NULL,
	"entrada" jsonb NOT NULL,
	"parametros" jsonb NOT NULL,
	"resultado" jsonb,
	"diagnostico" jsonb,
	"iniciada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizada_en" timestamp with time zone,
	"vigente_hasta" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_ejecucion_estado" CHECK ("ejecuciones_optimizacion"."estado" in ('en_ejecucion', 'aplicada', 'infactible', 'carga_incompleta', 'limite_tiempo', 'error', 'interrumpida', 'datos_desactualizados'))
);
--> statement-breakpoint
ALTER TABLE "ejecuciones_optimizacion" ADD CONSTRAINT "ejecuciones_optimizacion_planificacion_semestre_id_planificaciones_semestres_id_fk" FOREIGN KEY ("planificacion_semestre_id") REFERENCES "public"."planificaciones_semestres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ejecucion_clave_planificacion" ON "ejecuciones_optimizacion" USING btree ("planificacion_semestre_id","clave_idempotencia");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ejecucion_activa_planificacion" ON "ejecuciones_optimizacion" USING btree ("planificacion_semestre_id") WHERE "ejecuciones_optimizacion"."estado" = 'en_ejecucion';--> statement-breakpoint
CREATE INDEX "ix_ejecucion_ultima_planificacion" ON "ejecuciones_optimizacion" USING btree ("planificacion_semestre_id","iniciada_en");