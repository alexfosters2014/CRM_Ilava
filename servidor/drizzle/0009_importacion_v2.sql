CREATE TABLE "monedas_tipos_precio" (
	"moneda_id" integer NOT NULL,
	"tipo_precio_id" integer NOT NULL,
	CONSTRAINT "monedas_tipos_precio_moneda_id_tipo_precio_id_pk" PRIMARY KEY("moneda_id","tipo_precio_id")
);
--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "numeracion" varchar(30);--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "tipo_numeracion" varchar(20) DEFAULT 'SIN_NUMERACION' NOT NULL;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "tipo_comprobante" varchar(120);--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "tipo_precio" varchar(80);--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "id_cliente" integer;--> statement-breakpoint
ALTER TABLE "plantillas" ADD COLUMN "id_cliente" integer;--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "numeracion" varchar(30);--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "tipo_numeracion" varchar(20) DEFAULT 'SIN_NUMERACION' NOT NULL;--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "grupo_id" integer;--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "habilitado" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "monedas_tipos_precio" ADD CONSTRAINT "monedas_tipos_precio_moneda_id_monedas_id_fk" FOREIGN KEY ("moneda_id") REFERENCES "public"."monedas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monedas_tipos_precio" ADD CONSTRAINT "monedas_tipos_precio_tipo_precio_id_tipos_precios_id_fk" FOREIGN KEY ("tipo_precio_id") REFERENCES "public"."tipos_precios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_grupo_id_grupos_facturacion_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_facturacion"("id") ON DELETE no action ON UPDATE no action;