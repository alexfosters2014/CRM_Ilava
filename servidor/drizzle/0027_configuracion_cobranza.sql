CREATE TABLE "configuracion_cobranza" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"copia_activa" boolean DEFAULT false NOT NULL,
	"copia_emails" text,
	"copia_tipo" text DEFAULT 'CC' NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
