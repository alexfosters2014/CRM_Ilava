CREATE TABLE "factura_lineas" (
	"id" serial PRIMARY KEY NOT NULL,
	"factura_id" integer NOT NULL,
	"articulo_id" integer NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"descripcion" varchar(180) NOT NULL,
	"cantidad" numeric(14, 3) DEFAULT '0' NOT NULL,
	"importe_unitario" numeric(14, 2) DEFAULT '0' NOT NULL,
	"detalle" text,
	"comentario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"plantilla_id" integer NOT NULL,
	"periodo" varchar(7) NOT NULL,
	"servicio_id" integer,
	"contacto_facturacion" varchar(180) NOT NULL,
	"nombre_fantasia" varchar(180),
	"rut" varchar(20),
	"tipo_gestion" varchar(60) NOT NULL,
	"tipo_cliente" varchar(60) NOT NULL,
	"modalidad_cobranza" varchar(80) NOT NULL,
	"tipo_gestion_facturacion" varchar(60) NOT NULL,
	"comentario_gestion_facturacion" text,
	"moneda" varchar(3) NOT NULL,
	"fecha" date,
	"estado" varchar(20) DEFAULT 'PROCESO' NOT NULL,
	"motivo_pendiente" text,
	"serie" varchar(20),
	"numero" varchar(40),
	"comentario_general" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "variables" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variables_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "factura_lineas" ADD CONSTRAINT "factura_lineas_factura_id_facturas_id_fk" FOREIGN KEY ("factura_id") REFERENCES "public"."facturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_lineas" ADD CONSTRAINT "factura_lineas_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_plantilla_id_plantillas_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factura_lineas_factura_idx" ON "factura_lineas" USING btree ("factura_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facturas_plantilla_periodo_uq" ON "facturas" USING btree ("plantilla_id","periodo") WHERE "facturas"."eliminado_en" is null;--> statement-breakpoint
CREATE INDEX "facturas_estado_idx" ON "facturas" USING btree ("estado");