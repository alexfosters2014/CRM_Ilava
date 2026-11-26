CREATE TABLE "plantillas" (
	"id" serial PRIMARY KEY NOT NULL,
	"grupo_id" integer NOT NULL,
	"contacto" varchar(180) NOT NULL,
	"agrupador" varchar(40) NOT NULL,
	"fecha" date,
	"serie" varchar(20),
	"moneda_id" integer,
	"tipo_comprobante_id" integer,
	"tipo_precio_id" integer,
	"tipo_gestion_id" integer,
	"tipo_cliente_id" integer,
	"modalidad_cobranza_id" integer,
	"comentario_general" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plantillas_lineas" (
	"id" serial PRIMARY KEY NOT NULL,
	"plantilla_id" integer NOT NULL,
	"articulo_id" integer NOT NULL,
	"cantidad" numeric(14, 3) DEFAULT '0' NOT NULL,
	"importe_unitario" numeric(14, 2) DEFAULT '0' NOT NULL,
	"comentario" text,
	"detalle" text,
	"informacion_adicional" text,
	"id_compra" varchar(80),
	"vencimiento" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_grupo_id_grupos_facturacion_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_facturacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_moneda_id_monedas_id_fk" FOREIGN KEY ("moneda_id") REFERENCES "public"."monedas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_tipo_comprobante_id_tipos_comprobantes_id_fk" FOREIGN KEY ("tipo_comprobante_id") REFERENCES "public"."tipos_comprobantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_tipo_precio_id_tipos_precios_id_fk" FOREIGN KEY ("tipo_precio_id") REFERENCES "public"."tipos_precios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_tipo_gestion_id_tipos_gestion_id_fk" FOREIGN KEY ("tipo_gestion_id") REFERENCES "public"."tipos_gestion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_tipo_cliente_id_tipos_cliente_id_fk" FOREIGN KEY ("tipo_cliente_id") REFERENCES "public"."tipos_cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_modalidad_cobranza_id_modalidades_cobranza_id_fk" FOREIGN KEY ("modalidad_cobranza_id") REFERENCES "public"."modalidades_cobranza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_lineas" ADD CONSTRAINT "plantillas_lineas_plantilla_id_plantillas_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_lineas" ADD CONSTRAINT "plantillas_lineas_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plantillas_grupo_contacto_agrupador_uq" ON "plantillas" USING btree ("grupo_id","contacto","agrupador");--> statement-breakpoint
CREATE INDEX "plantillas_lineas_plantilla_idx" ON "plantillas_lineas" USING btree ("plantilla_id");