-- Un solo listado de emails por servicio, con destino explícito.
--
-- `contactos_cobranza` pasa a `servicios_emails`: la misma fila sirve para
-- facturación y cobranza. `uso` indica quién lo recibe:
--   COMPARTIDO  -> facturas y estados de cuenta
--   FACTURACION -> solo facturas
--   COBRANZA    -> solo estados de cuenta
--
-- Las filas existentes quedan en COBRANZA: no se inventan emails de facturación.

ALTER TABLE "contactos_cobranza" RENAME TO "servicios_emails";
ALTER SEQUENCE "contactos_cobranza_id_seq" RENAME TO "servicios_emails_id_seq";
ALTER TABLE "servicios_emails" RENAME CONSTRAINT "contactos_cobranza_pkey" TO "servicios_emails_pkey";
ALTER TABLE "servicios_emails" RENAME CONSTRAINT "contactos_cobranza_servicio_email_uq" TO "servicios_emails_servicio_email_uq";
ALTER TABLE "servicios_emails" RENAME CONSTRAINT "contactos_cobranza_servicio_id_servicios_id_fk" TO "servicios_emails_servicio_id_servicios_id_fk";

ALTER TABLE "servicios_emails" ADD COLUMN "uso" text DEFAULT 'COBRANZA' NOT NULL;
ALTER TABLE "servicios_emails" ADD CONSTRAINT "servicios_emails_uso_chk" CHECK ("uso" in ('COMPARTIDO', 'FACTURACION', 'COBRANZA'));
