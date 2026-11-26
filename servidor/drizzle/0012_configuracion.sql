CREATE TABLE "configuracion_visual" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fila_par_fondo" varchar(7) DEFAULT '#e2e9f7' NOT NULL,
	"fila_par_texto" varchar(7) DEFAULT '#111827' NOT NULL,
	"fila_impar_fondo" varchar(7) DEFAULT '#ffffff' NOT NULL,
	"fila_impar_texto" varchar(7) DEFAULT '#111827' NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articulos" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos_facturacion" ADD COLUMN "color_fondo" varchar(7) DEFAULT '#3346b8' NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos_facturacion" ADD COLUMN "color_texto" varchar(7) DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE "modalidades_cobranza" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "monedas" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_cliente" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_comprobantes" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_gestion" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_gestion_facturacion" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_precios" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint

-- Fila única de configuración visual, con los colores por defecto.
INSERT INTO "configuracion_visual" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- Colores de cabecera de los grupos existentes (paleta anterior).
UPDATE "grupos_facturacion" SET "color_fondo" = '#3346b8', "color_texto" = '#ffffff' WHERE "nombre" = 'FIJOS';--> statement-breakpoint
UPDATE "grupos_facturacion" SET "color_fondo" = '#0f7a5a', "color_texto" = '#ffffff' WHERE "nombre" = 'VARIABLES';--> statement-breakpoint
UPDATE "grupos_facturacion" SET "color_fondo" = '#be185d', "color_texto" = '#ffffff' WHERE "nombre" = 'ALARMAS';--> statement-breakpoint
UPDATE "grupos_facturacion" SET "color_fondo" = '#a16207', "color_texto" = '#ffffff' WHERE "nombre" = 'INDIVIDUAL';--> statement-breakpoint

-- Pares moneda → tipo de precio según Importaciones.xlsx.
INSERT INTO "monedas_tipos_precio" ("moneda_id", "tipo_precio_id")
SELECT m."id", p."id"
FROM "monedas" m, "tipos_precios" p
WHERE (m."codigo" = '$' AND p."nombre" IN ('90 días', '30 dias', '45 dias', '60 dias'))
   OR (m."codigo" = 'USD' AND p."nombre" IN ('30 dias.', '45 días'))
ON CONFLICT DO NOTHING;
