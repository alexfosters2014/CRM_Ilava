ALTER TABLE "configuracion_visual" ADD COLUMN "tabla_linea_color" varchar(7) DEFAULT '#e3e8f4' NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_visual" ADD COLUMN "tabla_linea_grosor" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_visual" ADD COLUMN "fila_padding_y" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_visual" ADD COLUMN "lista_linea_color" varchar(7) DEFAULT '#e3e8f4' NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_visual" ADD COLUMN "lista_linea_grosor" integer DEFAULT 1 NOT NULL;