-- Sesión única de WhatsApp Web (Baileys) de la empresa.
-- Una sola fila (id = 1): el socket vive en el proceso de la API.
CREATE TABLE IF NOT EXISTS "whatsapp_sesion" (
	"id" integer DEFAULT 1 PRIMARY KEY NOT NULL,
	"numero_telefono" varchar(20),
	"estado" varchar(24) DEFAULT 'DESCONECTADO' NOT NULL,
	"ultimo_error" text,
	"conectado_en" timestamp with time zone,
	"desconectado_en" timestamp with time zone,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_sesion_unica" CHECK ("id" = 1)
);

-- La fila existe desde el arranque: la API solo actualiza su estado.
INSERT INTO "whatsapp_sesion" ("id") VALUES (1)
ON CONFLICT ("id") DO NOTHING;
