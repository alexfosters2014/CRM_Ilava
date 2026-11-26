ALTER TABLE "exclusiones_cobranza" ADD COLUMN "tipo_comprobante" text;
ALTER TABLE "exclusiones_cobranza" ADD COLUMN "serie" text;
ALTER TABLE "exclusiones_cobranza" ADD COLUMN "numero" text;

-- Las claves anteriores usaban el texto crudo de `Comp.` o la fila completa.
-- La nueva regla es número + servicio + tipo + serie (o servicio sin comprobante),
-- así que esas reglas se desactivan para que el usuario las vuelva a crear.
UPDATE "exclusiones_cobranza"
SET "activo" = false
WHERE "clave" NOT LIKE 'numero|%'
  AND "clave" NOT LIKE 'sincomprobante|%';
