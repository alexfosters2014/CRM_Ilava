CREATE TABLE "articulos" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"descripcion" varchar(180) NOT NULL,
	CONSTRAINT "articulos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "grupos_facturacion" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"color" varchar(20) DEFAULT 'azul' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "grupos_facturacion_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "modalidades_cobranza" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	CONSTRAINT "modalidades_cobranza_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "monedas" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(12) NOT NULL,
	CONSTRAINT "monedas_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "tipos_cliente" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(60) NOT NULL,
	CONSTRAINT "tipos_cliente_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "tipos_comprobantes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	CONSTRAINT "tipos_comprobantes_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "tipos_gestion" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(60) NOT NULL,
	CONSTRAINT "tipos_gestion_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "tipos_precios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	CONSTRAINT "tipos_precios_nombre_unique" UNIQUE("nombre")
);
