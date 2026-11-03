CREATE TABLE "bloques_reservados" (
	"carrera_id" integer NOT NULL,
	"bloque_horario_id" integer NOT NULL,
	CONSTRAINT "bloques_reservados_carrera_id_bloque_horario_id_pk" PRIMARY KEY("carrera_id","bloque_horario_id")
);
--> statement-breakpoint
ALTER TABLE "bloques_reservados" ADD CONSTRAINT "bloques_reservados_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloques_reservados" ADD CONSTRAINT "bloques_reservados_bloque_horario_id_bloques_horarios_id_fk" FOREIGN KEY ("bloque_horario_id") REFERENCES "public"."bloques_horarios"("id") ON DELETE cascade ON UPDATE no action;