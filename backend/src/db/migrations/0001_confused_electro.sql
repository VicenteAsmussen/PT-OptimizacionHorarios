CREATE TABLE "asignatura_tipo_hora" (
	"asignatura_codigo" varchar(20) NOT NULL,
	"tipo_hora_id" integer NOT NULL,
	"horas" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "asignatura_tipo_hora_asignatura_codigo_tipo_hora_id_pk" PRIMARY KEY("asignatura_codigo","tipo_hora_id")
);
--> statement-breakpoint
ALTER TABLE "asignatura_tipo_hora" ADD CONSTRAINT "asignatura_tipo_hora_asignatura_codigo_asignaturas_codigo_fk" FOREIGN KEY ("asignatura_codigo") REFERENCES "public"."asignaturas"("codigo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignatura_tipo_hora" ADD CONSTRAINT "asignatura_tipo_hora_tipo_hora_id_tipos_hora_id_fk" FOREIGN KEY ("tipo_hora_id") REFERENCES "public"."tipos_hora"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaturas" DROP COLUMN "horas_teoria";--> statement-breakpoint
ALTER TABLE "asignaturas" DROP COLUMN "horas_practica";--> statement-breakpoint
ALTER TABLE "asignaturas" DROP COLUMN "horas_lab";