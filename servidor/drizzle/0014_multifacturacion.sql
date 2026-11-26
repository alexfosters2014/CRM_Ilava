CREATE TABLE "configuracion_facturacion" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"serie" varchar(10) DEFAULT 'A' NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "orden_manual" integer;