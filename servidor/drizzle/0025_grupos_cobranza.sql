CREATE TABLE "grupos_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"color_fondo" varchar(7) DEFAULT '#3346b8' NOT NULL,
	"color_texto" varchar(7) DEFAULT '#ffffff' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "grupos_cobranza_nombre_unique" UNIQUE("nombre")
);

ALTER TABLE "servicios" ADD COLUMN "grupo_cobranza_id" integer;
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_grupo_cobranza_id_grupos_cobranza_id_fk" FOREIGN KEY ("grupo_cobranza_id") REFERENCES "public"."grupos_cobranza"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "servicios_grupo_cobranza_idx" ON "servicios" ("grupo_cobranza_id");
