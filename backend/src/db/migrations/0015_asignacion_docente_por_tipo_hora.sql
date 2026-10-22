CREATE TABLE "oferta_tipo_hora" (
	"oferta_id" integer NOT NULL,
	"tipo_hora_id" integer NOT NULL,
	"profesor_id" integer NOT NULL,
	CONSTRAINT "oferta_tipo_hora_oferta_id_tipo_hora_id_pk" PRIMARY KEY("oferta_id","tipo_hora_id")
);
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" DROP CONSTRAINT "horarios_asignaturas_tipo_hora_id_tipos_hora_id_fk";
--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" DROP CONSTRAINT "ofertas_asignaturas_profesor_id_profesores_id_fk";
--> statement-breakpoint
ALTER TABLE "oferta_tipo_hora" ADD CONSTRAINT "oferta_tipo_hora_oferta_id_ofertas_asignaturas_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_asignaturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oferta_tipo_hora" ADD CONSTRAINT "oferta_tipo_hora_tipo_hora_id_tipos_hora_id_fk" FOREIGN KEY ("tipo_hora_id") REFERENCES "public"."tipos_hora"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oferta_tipo_hora" ADD CONSTRAINT "oferta_tipo_hora_profesor_id_profesores_id_fk" FOREIGN KEY ("profesor_id") REFERENCES "public"."profesores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Preserve the teacher of every existing scheduled type before removing the legacy association.
INSERT INTO "oferta_tipo_hora" ("oferta_id", "tipo_hora_id", "profesor_id")
SELECT DISTINCT o."id", h."tipo_hora_id", o."profesor_id"
FROM "ofertas_asignaturas" o
JOIN "horarios_asignaturas" h ON h."oferta_id" = o."id";
--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "fk_horarios_asignacion_docente" FOREIGN KEY ("oferta_id","tipo_hora_id") REFERENCES "public"."oferta_tipo_hora"("oferta_id","tipo_hora_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" DROP COLUMN "profesor_id";
