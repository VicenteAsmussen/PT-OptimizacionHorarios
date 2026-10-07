-- La migración se ejecuta en una transacción; impedir cambios durante la numeración.
LOCK TABLE "bloques_horarios" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- No eliminar bloques duplicados ni modificar sus referencias de forma implícita.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "bloques_horarios"
    GROUP BY "dia", "hora_inicio", "hora_termino"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen rangos horarios duplicados por día. Resolverlos explícitamente antes de reintentar la migración 0007.';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "bloques_horarios" ADD COLUMN "numero_bloque" integer;
--> statement-breakpoint
-- Numerar desde 1 por día en orden cronológico, conservando los IDs existentes.
WITH bloques_numerados AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "dia"
    ORDER BY "hora_inicio"::time, "hora_termino"::time, "id"
  ) AS numero_bloque
  FROM "bloques_horarios"
)
UPDATE "bloques_horarios" AS bloque
SET "numero_bloque" = numerado.numero_bloque
FROM bloques_numerados AS numerado
WHERE bloque."id" = numerado."id";
--> statement-breakpoint
ALTER TABLE "bloques_horarios" ALTER COLUMN "numero_bloque" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "bloques_horarios" ADD CONSTRAINT "uq_bloques_horarios_dia_numero" UNIQUE("dia", "numero_bloque");
--> statement-breakpoint
ALTER TABLE "bloques_horarios" ADD CONSTRAINT "uq_bloques_horarios_dia_rango" UNIQUE("dia", "hora_inicio", "hora_termino");
