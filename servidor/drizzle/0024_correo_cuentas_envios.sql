CREATE TABLE "cuentas_correo" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"host" text NOT NULL,
	"puerto" integer DEFAULT 587 NOT NULL,
	"seguro" boolean DEFAULT false NOT NULL,
	"usuario" text NOT NULL,
	"clave_cifrada" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"predeterminada" boolean DEFAULT false NOT NULL,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "cuentas_correo_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"cuenta_id" integer NOT NULL,
	"email" text NOT NULL,
	"nombre_visible" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuentas_correo_alias_cuenta_email_uq" UNIQUE("cuenta_id","email")
);

ALTER TABLE "cuentas_correo_alias" ADD CONSTRAINT "cuentas_correo_alias_cuenta_id_cuentas_correo_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_correo"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "envios_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"servicio_id" integer NOT NULL,
	"periodo" text NOT NULL,
	"cuenta_id" integer,
	"alias_id" integer,
	"plantilla_id" integer,
	"usuario" text,
	"destinatarios" jsonb NOT NULL,
	"asunto" text NOT NULL,
	"estado" text DEFAULT 'PENDIENTE' NOT NULL,
	"error" text,
	"message_id" text,
	"totales" jsonb,
	"comprobantes" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_en" timestamp with time zone
);

ALTER TABLE "envios_cobranza" ADD CONSTRAINT "envios_cobranza_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "envios_cobranza" ADD CONSTRAINT "envios_cobranza_cuenta_id_cuentas_correo_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_correo"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "envios_cobranza" ADD CONSTRAINT "envios_cobranza_alias_id_cuentas_correo_alias_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."cuentas_correo_alias"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "envios_cobranza_servicio_periodo_idx" ON "envios_cobranza" ("servicio_id","periodo");

ALTER TABLE "comprobantes_cobranza" ADD COLUMN "excluido_envio" boolean DEFAULT false NOT NULL;
ALTER TABLE "comprobantes_cobranza" ADD COLUMN "excluido_envio_en" timestamp with time zone;
ALTER TABLE "comprobantes_cobranza" ADD COLUMN "excluido_envio_por" text;
