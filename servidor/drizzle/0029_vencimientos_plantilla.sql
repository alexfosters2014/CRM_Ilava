ALTER TABLE "servicios" ADD COLUMN "cantidad_dias_vencimiento" integer DEFAULT 30 NOT NULL;

ALTER TABLE "configuracion_cobranza"
	ADD COLUMN "plantilla_predeterminada_id" integer
	REFERENCES "plantillas_cobranza"("id") ON DELETE SET NULL;
