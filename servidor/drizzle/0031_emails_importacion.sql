-- Histórico de bajas de emails de servicio e importaciones por planilla.
--
-- Los mails nunca se borran físicamente: al retirarse de cobranza quedan con
-- `activo = false` y la fecha/usuario/motivo de la baja. `importaciones_emails`
-- agrupa cada planilla importada para poder auditar y mostrar el historial.

ALTER TABLE "servicios_emails" ADD COLUMN "baja_en" timestamp with time zone;
ALTER TABLE "servicios_emails" ADD COLUMN "baja_por" text;
ALTER TABLE "servicios_emails" ADD COLUMN "baja_motivo" text;

CREATE TABLE "importaciones_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"archivo" text,
	"usuario" text,
	"totales" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
