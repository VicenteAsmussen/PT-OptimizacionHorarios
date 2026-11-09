CREATE TABLE "sesiones" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"expira_en" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "version_sesion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sesiones_usuario_id_idx" ON "sesiones" USING btree ("usuario_id");