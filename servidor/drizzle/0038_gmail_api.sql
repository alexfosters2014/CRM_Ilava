-- Conector Gmail API (OAuth 2.0) para seguimientos y tickets.
--
-- Se mantiene SMTP para los envíos masivos de cobranza. Gmail se usa donde
-- hace falta hilo y lectura de respuestas:
-- - refresco y acceso cifrados con CORREO_CLAVE (AES-256-GCM);
-- - historyId como cursor de sincronización;
-- - deduplicación del mensaje entrante por id de Gmail.

CREATE TABLE "gmail_cuentas" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre" text,
	"refresh_token_cifrado" text NOT NULL,
	"access_token_cifrado" text,
	"access_token_expira_en" timestamp with time zone,
	"scope" text,
	"history_id" text,
	"watch_expira_en" timestamp with time zone,
	"ultima_sincronizacion" timestamp with time zone,
	"ultimo_error" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "gmail_cuentas_email_uq" ON "gmail_cuentas" USING btree ("email");
CREATE INDEX "gmail_cuentas_activo_idx" ON "gmail_cuentas" USING btree ("activo");

ALTER TABLE "gmail_cuentas" ADD CONSTRAINT "gmail_cuentas_creado_por_user_id_fk"
	FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

-- Un mensaje de Gmail se incorpora una sola vez por cuenta y por seguimiento.
CREATE UNIQUE INDEX "seguimientos_correos_gmail_uq"
	ON "seguimientos_correos" USING btree ("cuenta_id", "gmail_message_id")
	WHERE "gmail_message_id" IS NOT NULL;
