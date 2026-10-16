-- Sin backfill ni eliminación automática: requiere profesores vacía o un plan separado
-- de remediación con RUT reales antes de aplicar/adaptar esta migración bajo autorización.
ALTER TABLE "profesores" ADD COLUMN "rut" text NOT NULL;--> statement-breakpoint
ALTER TABLE "profesores" ADD CONSTRAINT "profesores_rut_unique" UNIQUE("rut");