ALTER TABLE "facturas" ADD COLUMN "facturado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "facturado_por" varchar(20);--> statement-breakpoint
UPDATE "facturas"
SET "facturado_en" = "actualizado_en"
WHERE "estado" IN ('FACTURADO', 'COBRADO') AND "facturado_en" IS NULL;
