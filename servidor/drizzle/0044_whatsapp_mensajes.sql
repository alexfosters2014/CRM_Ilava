-- Mensajes de WhatsApp que pertenecen a algún seguimiento y su vínculo N:M
-- con los casos. El id de WhatsApp (wa_id) deduplica el eco de los salientes.
CREATE TABLE IF NOT EXISTS "whatsapp_mensajes" (
	"id" serial PRIMARY KEY NOT NULL,
	"wa_id" varchar(120) NOT NULL,
	"telefono" varchar(20) NOT NULL,
	"jid" varchar(80) NOT NULL,
	"lid" varchar(80),
	"direccion" varchar(10) NOT NULL,
	"tipo" varchar(20) DEFAULT 'TEXTO' NOT NULL,
	"texto" text,
	"nombre_archivo" varchar(200),
	"mimetype" varchar(120),
	"estado" varchar(20) DEFAULT 'RECIBIDO' NOT NULL,
	"enviado_por_usuario_id" text,
	"desde_telefono" boolean DEFAULT false NOT NULL,
	"enviado_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"metadatos" jsonb
);

DO $$ BEGIN
	ALTER TABLE "whatsapp_mensajes"
		ADD CONSTRAINT "whatsapp_mensajes_enviado_por_usuario_id_user_id_fk"
		FOREIGN KEY ("enviado_por_usuario_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_mensajes_wa_id_uq" ON "whatsapp_mensajes" USING btree ("wa_id");
CREATE INDEX IF NOT EXISTS "whatsapp_mensajes_telefono_idx" ON "whatsapp_mensajes" USING btree ("telefono", "enviado_en");
CREATE INDEX IF NOT EXISTS "whatsapp_mensajes_enviado_idx" ON "whatsapp_mensajes" USING btree ("enviado_en");

CREATE TABLE IF NOT EXISTS "whatsapp_mensajes_seguimientos" (
	"id" serial PRIMARY KEY NOT NULL,
	"mensaje_id" integer NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"vinculado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"desvinculado_en" timestamp with time zone
);

DO $$ BEGIN
	ALTER TABLE "whatsapp_mensajes_seguimientos"
		ADD CONSTRAINT "whatsapp_mensajes_seguimientos_mensaje_id_whatsapp_mensajes_id_fk"
		FOREIGN KEY ("mensaje_id") REFERENCES "whatsapp_mensajes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "whatsapp_mensajes_seguimientos"
		ADD CONSTRAINT "whatsapp_mensajes_seguimientos_seguimiento_id_seguimientos_id_fk"
		FOREIGN KEY ("seguimiento_id") REFERENCES "seguimientos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_mensajes_seguimientos_uq" ON "whatsapp_mensajes_seguimientos" USING btree ("mensaje_id", "seguimiento_id");
CREATE INDEX IF NOT EXISTS "whatsapp_mensajes_seguimientos_caso_idx" ON "whatsapp_mensajes_seguimientos" USING btree ("seguimiento_id", "desvinculado_en");
CREATE INDEX IF NOT EXISTS "whatsapp_mensajes_seguimientos_mensaje_idx" ON "whatsapp_mensajes_seguimientos" USING btree ("mensaje_id");
