ALTER TABLE "horarios_asignaturas" ALTER COLUMN "sala_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "semestres" ADD COLUMN "horario_publicado" boolean DEFAULT false NOT NULL;