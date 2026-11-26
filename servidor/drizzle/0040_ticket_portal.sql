ALTER TABLE "ticket_mensajes" ADD COLUMN IF NOT EXISTS "visible_cliente" boolean DEFAULT true NOT NULL;

CREATE TABLE IF NOT EXISTS "ticket_enlaces_publicos" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"email" varchar(200),
	"token_hash" varchar(64) NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"revocado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_en" timestamp with time zone,
	"usos" integer DEFAULT 0 NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "ticket_enlaces_publicos"
		ADD CONSTRAINT "ticket_enlaces_publicos_ticket_id_tickets_id_fk"
		FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_enlaces_token_uq" ON "ticket_enlaces_publicos" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "ticket_enlaces_ticket_idx" ON "ticket_enlaces_publicos" USING btree ("ticket_id");
