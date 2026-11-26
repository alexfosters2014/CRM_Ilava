-- Limpieza de datos aprobada por el usuario (29-oct-2026) para probar las
-- nuevas importaciones desde cero. Se conservan catálogos, grupos y variables.
DELETE FROM "facturas";--> statement-breakpoint
DELETE FROM "plantillas";--> statement-breakpoint
DELETE FROM "servicios";--> statement-breakpoint
ALTER TABLE "plantillas" DROP CONSTRAINT "plantillas_grupo_id_grupos_facturacion_id_fk";--> statement-breakpoint
DROP INDEX "plantillas_grupo_servicio_agrupador_uq";--> statement-breakpoint
ALTER TABLE "servicios" ALTER COLUMN "grupo_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plantillas_servicio_agrupador_uq" ON "plantillas" USING btree ("servicio_id","agrupador");--> statement-breakpoint
ALTER TABLE "plantillas" DROP COLUMN "grupo_id";--> statement-breakpoint
ALTER TABLE "servicios" DROP COLUMN "rut";--> statement-breakpoint
ALTER TABLE "facturas" DROP COLUMN "rut";
