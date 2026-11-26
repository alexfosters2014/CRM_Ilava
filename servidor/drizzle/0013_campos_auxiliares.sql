ALTER TABLE "facturas" ADD COLUMN "id_compra" varchar(80);--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "detalle_auxiliar" text;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "ute_vencimiento" date;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "informacion_adicional" text;--> statement-breakpoint
ALTER TABLE "plantillas" ADD COLUMN "id_compra" varchar(80);--> statement-breakpoint
ALTER TABLE "plantillas" ADD COLUMN "detalle_auxiliar" text;--> statement-breakpoint
ALTER TABLE "plantillas" ADD COLUMN "ute_vencimiento" date;--> statement-breakpoint
ALTER TABLE "plantillas" ADD COLUMN "informacion_adicional" text;--> statement-breakpoint
UPDATE "plantillas" p SET
	"id_compra" = acumulado."id_compra",
	"informacion_adicional" = acumulado."informacion_adicional",
	"ute_vencimiento" = acumulado."vencimiento"
FROM (
	SELECT
		"plantilla_id",
		(array_agg("id_compra" ORDER BY "id") FILTER (WHERE "id_compra" IS NOT NULL))[1] AS "id_compra",
		(array_agg("informacion_adicional" ORDER BY "id") FILTER (WHERE "informacion_adicional" IS NOT NULL))[1] AS "informacion_adicional",
		(array_agg("vencimiento" ORDER BY "id") FILTER (WHERE "vencimiento" IS NOT NULL))[1] AS "vencimiento"
	FROM "plantillas_lineas"
	GROUP BY "plantilla_id"
) acumulado
WHERE p."id" = acumulado."plantilla_id";--> statement-breakpoint
ALTER TABLE "plantillas_lineas" DROP COLUMN "informacion_adicional";--> statement-breakpoint
ALTER TABLE "plantillas_lineas" DROP COLUMN "id_compra";--> statement-breakpoint
ALTER TABLE "plantillas_lineas" DROP COLUMN "vencimiento";
