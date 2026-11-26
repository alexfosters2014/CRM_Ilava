-- Validación de la solución y espera de respuesta.
--
-- Reglas:
-- - Cualquier usuario involucrado puede validar un ticket Resuelto.
-- - Para pasar a ESPERANDO_RESPUESTA hay que indicar de qué área o usuario se
--   espera y el detalle de lo que se necesita.
-- - El cierre sigue siendo exclusivo del creador.

ALTER TABLE "tickets" ADD COLUMN "validado_en" timestamp with time zone;
ALTER TABLE "tickets" ADD COLUMN "validado_por_usuario_id" text;
ALTER TABLE "tickets" ADD COLUMN "espera_de_area_id" integer;
ALTER TABLE "tickets" ADD COLUMN "espera_de_usuario_id" text;
ALTER TABLE "tickets" ADD COLUMN "espera_detalle" text;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_validado_por_usuario_id_user_id_fk"
	FOREIGN KEY ("validado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_espera_de_area_id_areas_id_fk"
	FOREIGN KEY ("espera_de_area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_espera_de_usuario_id_user_id_fk"
	FOREIGN KEY ("espera_de_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
