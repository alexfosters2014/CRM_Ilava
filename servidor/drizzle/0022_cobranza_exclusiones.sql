CREATE TABLE "exclusiones_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"contacto" text NOT NULL,
	"comprobante" text,
	"fecha_emision" date,
	"moneda" text,
	"importe" text,
	"saldo_pendiente" text,
	"motivo" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exclusiones_cobranza_clave_unique" UNIQUE("clave")
);
