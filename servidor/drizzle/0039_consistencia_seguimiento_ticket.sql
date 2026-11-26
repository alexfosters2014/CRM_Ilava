-- Consistencia seguimiento-ticket y visibilidad por área de las casillas Gmail.
--
-- 1. Integridad referencial de los eventos del seguimiento: correo, tarea,
--    promesa y ticket pasan a tener FK (on delete set null).
-- 2. gmail_cuentas.area_id: una casilla conectada queda visible solo para su
--    área (ADMIN y área TODOS ven todas).

ALTER TABLE "seguimientos_eventos" ADD CONSTRAINT "seguimientos_eventos_correo_id_seguimientos_correos_id_fk"
	FOREIGN KEY ("correo_id") REFERENCES "public"."seguimientos_correos"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "seguimientos_eventos" ADD CONSTRAINT "seguimientos_eventos_tarea_id_seguimientos_tareas_id_fk"
	FOREIGN KEY ("tarea_id") REFERENCES "public"."seguimientos_tareas"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "seguimientos_eventos" ADD CONSTRAINT "seguimientos_eventos_promesa_id_seguimientos_promesas_id_fk"
	FOREIGN KEY ("promesa_id") REFERENCES "public"."seguimientos_promesas"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "seguimientos_eventos" ADD CONSTRAINT "seguimientos_eventos_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "gmail_cuentas" ADD COLUMN "area_id" integer;
CREATE INDEX "gmail_cuentas_area_idx" ON "gmail_cuentas" USING btree ("area_id");
ALTER TABLE "gmail_cuentas" ADD CONSTRAINT "gmail_cuentas_area_id_areas_id_fk"
	FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;
