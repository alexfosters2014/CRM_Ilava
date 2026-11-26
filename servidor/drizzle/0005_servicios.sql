CREATE TABLE "servicios" (
	"id" serial PRIMARY KEY NOT NULL,
	"contacto_facturacion" varchar(180) NOT NULL,
	"nombre_fantasia" varchar(180),
	"rut" varchar(20),
	"tipo_gestion_id" integer NOT NULL,
	"tipo_cliente_id" integer NOT NULL,
	"modalidad_cobranza_id" integer NOT NULL,
	"tipo_gestion_facturacion_id" integer NOT NULL,
	"comentario_gestion_facturacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	CONSTRAINT "servicios_contacto_facturacion_unique" UNIQUE("contacto_facturacion")
);
--> statement-breakpoint
CREATE TABLE "tipos_gestion_facturacion" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(60) NOT NULL,
	CONSTRAINT "tipos_gestion_facturacion_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "plantillas" ADD COLUMN "servicio_id" integer;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_tipo_gestion_id_tipos_gestion_id_fk" FOREIGN KEY ("tipo_gestion_id") REFERENCES "public"."tipos_gestion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_tipo_cliente_id_tipos_cliente_id_fk" FOREIGN KEY ("tipo_cliente_id") REFERENCES "public"."tipos_cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_modalidad_cobranza_id_modalidades_cobranza_id_fk" FOREIGN KEY ("modalidad_cobranza_id") REFERENCES "public"."modalidades_cobranza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_tipo_gestion_facturacion_id_tipos_gestion_facturacion_id_fk" FOREIGN KEY ("tipo_gestion_facturacion_id") REFERENCES "public"."tipos_gestion_facturacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Semillas mínimas para poder migrar las plantillas que ya existan.
INSERT INTO "tipos_gestion" ("nombre") VALUES ('NORMAL'), ('CONCORDATO'), ('ACUERDO'), ('LEGAL'), ('INCOBRABLE') ON CONFLICT ("nombre") DO NOTHING;--> statement-breakpoint
INSERT INTO "tipos_cliente" ("nombre") VALUES ('EMPRESA'), ('PERSONAL') ON CONFLICT ("nombre") DO NOTHING;--> statement-breakpoint
INSERT INTO "modalidades_cobranza" ("nombre") VALUES ('DEB AUT'), ('TRANSFERENCIA'), ('CHEQUES') ON CONFLICT ("nombre") DO NOTHING;--> statement-breakpoint
INSERT INTO "tipos_gestion_facturacion" ("nombre") VALUES ('NORMAL'), ('CONFORMIDAD'), ('OC_MENSUAL'), ('OC_PERIODO'), ('PLATAFORMA') ON CONFLICT ("nombre") DO NOTHING;--> statement-breakpoint

-- Un servicio por cada contacto existente, heredando los atributos de gestión de
-- su plantilla más antigua (a partir de acá esos atributos viven en el servicio).
INSERT INTO "servicios" (
	"contacto_facturacion",
	"tipo_gestion_id",
	"tipo_cliente_id",
	"modalidad_cobranza_id",
	"tipo_gestion_facturacion_id"
)
SELECT DISTINCT ON (lower(btrim("contacto")))
	btrim("contacto"),
	COALESCE("tipo_gestion_id", (SELECT "id" FROM "tipos_gestion" WHERE "nombre" = 'NORMAL')),
	COALESCE("tipo_cliente_id", (SELECT "id" FROM "tipos_cliente" WHERE "nombre" = 'EMPRESA')),
	COALESCE(
		"modalidad_cobranza_id",
		(SELECT "id" FROM "modalidades_cobranza" WHERE "nombre" = 'TRANSFERENCIA')
	),
	(SELECT "id" FROM "tipos_gestion_facturacion" WHERE "nombre" = 'NORMAL')
FROM "plantillas"
WHERE btrim("contacto") <> ''
ORDER BY lower(btrim("contacto")), "id";--> statement-breakpoint

UPDATE "plantillas" p
SET "servicio_id" = s."id"
FROM "servicios" s
WHERE lower(btrim(s."contacto_facturacion")) = lower(btrim(p."contacto"));