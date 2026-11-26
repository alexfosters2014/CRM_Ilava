CREATE TABLE "lotes_envio_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"periodo" text NOT NULL,
	"plantilla_id" integer,
	"cuenta_id" integer,
	"alias_id" integer,
	"usuario" text,
	"total" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'PENDIENTE' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_en" timestamp with time zone,
	"finalizado_en" timestamp with time zone
);

ALTER TABLE "lotes_envio_cobranza" ADD CONSTRAINT "lotes_envio_cobranza_plantilla_id_plantillas_cobranza_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_cobranza"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lotes_envio_cobranza" ADD CONSTRAINT "lotes_envio_cobranza_cuenta_id_cuentas_correo_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_correo"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lotes_envio_cobranza" ADD CONSTRAINT "lotes_envio_cobranza_alias_id_cuentas_correo_alias_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."cuentas_correo_alias"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "lotes_envio_cobranza_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"lote_id" integer NOT NULL,
	"servicio_id" integer NOT NULL,
	"estado" text DEFAULT 'PENDIENTE' NOT NULL,
	"error" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"reanudado" boolean DEFAULT false NOT NULL,
	"envio_id" integer,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lotes_envio_cobranza_items_lote_servicio_uq" UNIQUE("lote_id","servicio_id")
);

ALTER TABLE "lotes_envio_cobranza_items" ADD CONSTRAINT "lotes_envio_cobranza_items_lote_id_lotes_envio_cobranza_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes_envio_cobranza"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lotes_envio_cobranza_items" ADD CONSTRAINT "lotes_envio_cobranza_items_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lotes_envio_cobranza_items" ADD CONSTRAINT "lotes_envio_cobranza_items_envio_id_envios_cobranza_id_fk" FOREIGN KEY ("envio_id") REFERENCES "public"."envios_cobranza"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "lotes_envio_cobranza_estado_idx" ON "lotes_envio_cobranza" ("estado");
CREATE INDEX "lotes_envio_cobranza_items_lote_estado_idx" ON "lotes_envio_cobranza_items" ("lote_id","estado");
