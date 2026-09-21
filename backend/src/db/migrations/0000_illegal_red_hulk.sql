CREATE TYPE "public"."rol_usuario" AS ENUM('secretaria', 'profesor', 'admin');--> statement-breakpoint
CREATE TABLE "asignaturas" (
	"codigo" varchar(20) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"horas_teoria" integer DEFAULT 0 NOT NULL,
	"horas_practica" integer DEFAULT 0 NOT NULL,
	"horas_lab" integer DEFAULT 0 NOT NULL,
	"semestre_malla" integer NOT NULL,
	"es_critica" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carrera_asignatura" (
	"carrera_id" integer NOT NULL,
	"asignatura_codigo" varchar(20) NOT NULL,
	CONSTRAINT "carrera_asignatura_carrera_id_asignatura_codigo_pk" PRIMARY KEY("carrera_id","asignatura_codigo")
);
--> statement-breakpoint
CREATE TABLE "carrera_departamento" (
	"carrera_id" integer NOT NULL,
	"departamento_id" integer NOT NULL,
	CONSTRAINT "carrera_departamento_carrera_id_departamento_id_pk" PRIMARY KEY("carrera_id","departamento_id")
);
--> statement-breakpoint
CREATE TABLE "carreras" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios_asignaturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"oferta_id" integer NOT NULL,
	"sala_id" integer NOT NULL,
	"bloque_id" integer NOT NULL,
	"tipo_hora_id" integer NOT NULL,
	"semestre_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"correo" text NOT NULL,
	"clave" text NOT NULL,
	"rol" "rol_usuario" DEFAULT 'secretaria' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_correo_unique" UNIQUE("correo")
);
--> statement-breakpoint
CREATE TABLE "profesores" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"departamento_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bloques_horarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"dia" varchar(15) NOT NULL,
	"hora_inicio" varchar(10) NOT NULL,
	"hora_termino" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"capacidad" integer NOT NULL,
	"tipo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semestres" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nombre" text NOT NULL,
	"anio" integer NOT NULL,
	CONSTRAINT "semestres_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "tipos_hora" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disponibilidad_profesores" (
	"id" serial PRIMARY KEY NOT NULL,
	"profesor_id" integer NOT NULL,
	"semestre_id" integer NOT NULL,
	"bloque_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ofertas_asignaturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"asignatura_codigo" varchar(20) NOT NULL,
	"profesor_id" integer NOT NULL,
	"semestre_id" integer NOT NULL,
	"seccion" integer DEFAULT 1 NOT NULL,
	"cupos" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carrera_asignatura" ADD CONSTRAINT "carrera_asignatura_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrera_asignatura" ADD CONSTRAINT "carrera_asignatura_asignatura_codigo_asignaturas_codigo_fk" FOREIGN KEY ("asignatura_codigo") REFERENCES "public"."asignaturas"("codigo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrera_departamento" ADD CONSTRAINT "carrera_departamento_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrera_departamento" ADD CONSTRAINT "carrera_departamento_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "horarios_asignaturas_oferta_id_ofertas_asignaturas_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_asignaturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "horarios_asignaturas_sala_id_salas_id_fk" FOREIGN KEY ("sala_id") REFERENCES "public"."salas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "horarios_asignaturas_bloque_id_bloques_horarios_id_fk" FOREIGN KEY ("bloque_id") REFERENCES "public"."bloques_horarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "horarios_asignaturas_tipo_hora_id_tipos_hora_id_fk" FOREIGN KEY ("tipo_hora_id") REFERENCES "public"."tipos_hora"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_asignaturas" ADD CONSTRAINT "horarios_asignaturas_semestre_id_semestres_id_fk" FOREIGN KEY ("semestre_id") REFERENCES "public"."semestres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesores" ADD CONSTRAINT "profesores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesores" ADD CONSTRAINT "profesores_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" ADD CONSTRAINT "disponibilidad_profesores_profesor_id_profesores_id_fk" FOREIGN KEY ("profesor_id") REFERENCES "public"."profesores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" ADD CONSTRAINT "disponibilidad_profesores_semestre_id_semestres_id_fk" FOREIGN KEY ("semestre_id") REFERENCES "public"."semestres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidad_profesores" ADD CONSTRAINT "disponibilidad_profesores_bloque_id_bloques_horarios_id_fk" FOREIGN KEY ("bloque_id") REFERENCES "public"."bloques_horarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" ADD CONSTRAINT "ofertas_asignaturas_asignatura_codigo_asignaturas_codigo_fk" FOREIGN KEY ("asignatura_codigo") REFERENCES "public"."asignaturas"("codigo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" ADD CONSTRAINT "ofertas_asignaturas_profesor_id_profesores_id_fk" FOREIGN KEY ("profesor_id") REFERENCES "public"."profesores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ofertas_asignaturas" ADD CONSTRAINT "ofertas_asignaturas_semestre_id_semestres_id_fk" FOREIGN KEY ("semestre_id") REFERENCES "public"."semestres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_horarios_semestre_bloque_sala" ON "horarios_asignaturas" USING btree ("semestre_id","bloque_id","sala_id");