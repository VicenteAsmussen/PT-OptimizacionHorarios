-- Run within the migration transaction; prevent writes between preservation checks and backfill.
LOCK TABLE "semestres", "horarios_asignaturas" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- A true flag on an empty semester cannot be represented by an entry relationship.
-- Fail before schema changes rather than silently discard publication or invent entries.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "semestres" s
    WHERE s."horario_publicado" = true
      AND NOT EXISTS (
        SELECT 1 FROM "horarios_asignaturas" e WHERE e."semestre_id" = s."id"
      )
  ) THEN
    RAISE EXCEPTION 'Cannot preserve horario_publicado: a published semester has no horarios_asignaturas entries. Resolve its publication state explicitly before retrying migration 0006.';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "semestres_horarios" (
	"semestre_id" integer NOT NULL,
	"horario_asignatura_id" integer PRIMARY KEY NOT NULL,
	"horario_publicado" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
-- PostgreSQL requires the referenced composite unique constraint before adding its FK.
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "uq_horarios_asignaturas_id_semestre" UNIQUE("id","semestre_id");
--> statement-breakpoint
ALTER TABLE "semestres_horarios" ADD CONSTRAINT "semestres_horarios_semestre_id_semestres_id_fk" FOREIGN KEY ("semestre_id") REFERENCES "public"."semestres"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "semestres_horarios" ADD CONSTRAINT "fk_semestres_horarios_entrada_semestre" FOREIGN KEY ("horario_asignatura_id","semestre_id") REFERENCES "public"."horarios_asignaturas"("id","semestre_id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
-- Copy true and false for every existing entry, leaving IDs, rooms and semesters unchanged.
INSERT INTO "semestres_horarios" ("semestre_id", "horario_asignatura_id", "horario_publicado")
SELECT e."semestre_id", e."id", s."horario_publicado"
FROM "horarios_asignaturas" e JOIN "semestres" s ON s."id" = e."semestre_id";
--> statement-breakpoint
ALTER TABLE "semestres" DROP COLUMN "horario_publicado";
