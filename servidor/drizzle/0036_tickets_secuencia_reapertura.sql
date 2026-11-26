-- Secuencia propia del código visible de tickets y motivo de reapertura.
--
-- El código es continuo y no anual: TCK-000001. La secuencia evita carreras
-- entre dos altas simultáneas; los huecos por rollback son aceptables.

CREATE SEQUENCE IF NOT EXISTS "ticket_codigo_seq" START 1;

ALTER TABLE "tickets" ADD COLUMN "motivo_reapertura" text;
