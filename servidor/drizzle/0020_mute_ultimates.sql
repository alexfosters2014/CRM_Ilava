CREATE TABLE "auditoria_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"comprobante_id" integer,
	"servicio_id" integer NOT NULL,
	"accion" text NOT NULL,
	"detalle" jsonb,
	"usuario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobantes_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"periodo_id" integer NOT NULL,
	"servicio_id" integer NOT NULL,
	"clave_origen" text NOT NULL,
	"serie" text NOT NULL,
	"numero" text NOT NULL,
	"fecha_emision" date NOT NULL,
	"fecha_vencimiento" date,
	"moneda" text NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"saldo_pendiente" numeric(18, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"eliminado_en" timestamp with time zone,
	"eliminado_por" text,
	"eliminado_motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comprobantes_cobranza_periodo_clave_uq" UNIQUE("periodo_id","clave_origen")
);
--> statement-breakpoint
CREATE TABLE "contactos_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"servicio_id" integer NOT NULL,
	"email" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contactos_cobranza_servicio_email_uq" UNIQUE("servicio_id","email")
);
--> statement-breakpoint
CREATE TABLE "periodos_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"periodo" text NOT NULL,
	"cotizacion_usd" numeric(18, 6) NOT NULL,
	"archivo_nombre" text,
	"archivo_hash" text,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodos_cobranza_periodo_unique" UNIQUE("periodo")
);
--> statement-breakpoint
CREATE TABLE "plantillas_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"asunto" text NOT NULL,
	"cuerpo" text NOT NULL,
	"carta_habilitada" boolean DEFAULT false NOT NULL,
	"carta_html" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plantillas_cobranza_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "auditoria_cobranza" ADD CONSTRAINT "auditoria_cobranza_comprobante_id_comprobantes_cobranza_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobantes_cobranza"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_cobranza" ADD CONSTRAINT "auditoria_cobranza_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_cobranza" ADD CONSTRAINT "comprobantes_cobranza_periodo_id_periodos_cobranza_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."periodos_cobranza"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_cobranza" ADD CONSTRAINT "comprobantes_cobranza_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactos_cobranza" ADD CONSTRAINT "contactos_cobranza_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;