ALTER TABLE "asignaturas" ADD COLUMN "requiere_sala" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "asignaturas" SET "requiere_sala" = false WHERE "codigo" IN ('620449', '620456', '620477');
