ALTER TABLE "facturas" ADD COLUMN "grupo_id" integer;--> statement-breakpoint
UPDATE "facturas" f SET "grupo_id" = p."grupo_id" FROM "plantillas" p WHERE p."id" = f."plantilla_id";--> statement-breakpoint
ALTER TABLE "facturas" ALTER COLUMN "grupo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_grupo_id_grupos_facturacion_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_facturacion"("id") ON DELETE no action ON UPDATE no action;
