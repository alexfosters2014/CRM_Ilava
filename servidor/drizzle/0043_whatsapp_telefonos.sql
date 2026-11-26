-- Celular del servicio y teléfono WhatsApp del seguimiento.
-- El seguimiento copia el celular al abrirse; si después el servicio cambia,
-- el caso conserva el número con el que se inició (snapshot editable).
ALTER TABLE "servicios" ADD COLUMN IF NOT EXISTS "celular" varchar(20);

ALTER TABLE "seguimientos" ADD COLUMN IF NOT EXISTS "telefono_whatsapp" varchar(20);

ALTER TABLE "seguimientos" ADD COLUMN IF NOT EXISTS "telefono_whatsapp_verificado_en" timestamp with time zone;

-- Lista blanca de recepción: resolver rápido el teléfono contra casos activos.
CREATE INDEX IF NOT EXISTS "seguimientos_telefono_whatsapp_idx"
	ON "seguimientos" USING btree ("telefono_whatsapp");
