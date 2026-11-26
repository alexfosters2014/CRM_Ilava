CREATE TABLE IF NOT EXISTS "ticket_correo_envios" (
	"id" serial PRIMARY KEY NOT NULL,
	"correo_id" integer NOT NULL,
	"destinatario" varchar(200) NOT NULL,
	"gmail_message_id" varchar(200),
	"message_id_header" varchar(300),
	"thread_id" varchar(200),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "ticket_correo_envios"
		ADD CONSTRAINT "ticket_correo_envios_correo_id_ticket_correos_id_fk"
		FOREIGN KEY ("correo_id") REFERENCES "ticket_correos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "ticket_correo_envios_correo_idx" ON "ticket_correo_envios" USING btree ("correo_id");
CREATE INDEX IF NOT EXISTS "ticket_correo_envios_gmail_idx" ON "ticket_correo_envios" USING btree ("gmail_message_id");
