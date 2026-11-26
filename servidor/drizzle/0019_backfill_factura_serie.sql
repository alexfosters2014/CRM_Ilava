-- Repara las facturas creadas antes del fix: la copia desde la plantilla no
-- incluia `serie`, por lo que quedaban en NULL. Solo completa las vacias que
-- tienen una plantilla con serie.
UPDATE "facturas" AS f
SET "serie" = p."serie"
FROM "plantillas" AS p
WHERE f."plantilla_id" = p."id"
  AND f."serie" IS NULL
  AND p."serie" IS NOT NULL;
