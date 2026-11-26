ALTER TABLE "configuracion_facturacion" ADD COLUMN "periodo" varchar(7);--> statement-breakpoint
ALTER TABLE "configuracion_facturacion" ADD COLUMN "fecha_general" date;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "variables_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "variables" ADD COLUMN "valor" text;