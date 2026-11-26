ALTER TABLE "plantillas" DROP CONSTRAINT "plantillas_tipo_gestion_id_tipos_gestion_id_fk";
--> statement-breakpoint
ALTER TABLE "plantillas" DROP CONSTRAINT "plantillas_tipo_cliente_id_tipos_cliente_id_fk";
--> statement-breakpoint
ALTER TABLE "plantillas" DROP CONSTRAINT "plantillas_modalidad_cobranza_id_modalidades_cobranza_id_fk";
--> statement-breakpoint
DROP INDEX "plantillas_grupo_contacto_agrupador_uq";--> statement-breakpoint
ALTER TABLE "plantillas" ALTER COLUMN "servicio_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plantillas_grupo_servicio_agrupador_uq" ON "plantillas" USING btree ("grupo_id","servicio_id","agrupador");--> statement-breakpoint
ALTER TABLE "plantillas" DROP COLUMN "contacto";--> statement-breakpoint
ALTER TABLE "plantillas" DROP COLUMN "tipo_gestion_id";--> statement-breakpoint
ALTER TABLE "plantillas" DROP COLUMN "tipo_cliente_id";--> statement-breakpoint
ALTER TABLE "plantillas" DROP COLUMN "modalidad_cobranza_id";