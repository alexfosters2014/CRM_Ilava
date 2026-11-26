-- Usuarios administrables, áreas organizativas y permisos por pantalla.
--
-- `areas` NO otorga permisos ni filtra datos: es una agrupación de usuarios.
-- `permisos_usuario` guarda una fila por hoja del catálogo declarado en
-- `src/lib/server/permisos/catalogo.ts` (el catálogo vive en código: agregar
-- una pantalla requiere deploy de todas formas, y una tabla espejo sería una
-- segunda lista que se desincroniza).
--
-- La baja de usuarios y áreas es lógica (`eliminado_en` / `activo`), igual que
-- en comprobantes_cobranza: se conserva el historial y se puede restaurar.

CREATE TABLE "areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"protegida" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"eliminado_en" timestamp with time zone,
	"eliminado_por" text,
	"eliminado_motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_nombre_unique" UNIQUE("nombre")
);

CREATE TABLE "permisos_usuario" (
	"usuario_id" text NOT NULL,
	"clave" varchar(80) NOT NULL,
	"otorgado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"otorgado_por" text,
	CONSTRAINT "permisos_usuario_usuario_id_clave_pk" PRIMARY KEY("usuario_id","clave")
);

ALTER TABLE "permisos_usuario" ADD CONSTRAINT "permisos_usuario_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "permisos_usuario_clave_idx" ON "permisos_usuario" USING btree ("clave");

ALTER TABLE "user" ADD COLUMN "rol" text DEFAULT 'OPERADOR' NOT NULL;
ALTER TABLE "user" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;
ALTER TABLE "user" ADD COLUMN "area_id" integer;
ALTER TABLE "user" ADD COLUMN "eliminado_en" timestamp with time zone;
ALTER TABLE "user" ADD COLUMN "eliminado_por" text;
ALTER TABLE "user" ADD COLUMN "eliminado_motivo" text;
ALTER TABLE "user" ADD CONSTRAINT "user_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "user" ADD CONSTRAINT "user_rol_chk" CHECK ("rol" in ('ADMIN', 'OPERADOR'));

-- Área del sistema: recibe al primer administrador y no se puede dar de baja.
INSERT INTO "areas" ("nombre", "protegida") VALUES ('TODOS', true)
ON CONFLICT ("nombre") DO NOTHING;

-- Backfill de la base existente: el usuario más antiguo pasa a ADMIN con área
-- TODOS. Sin esto, la base queda sin administrador y nadie puede repartir
-- permisos. En una base vacía no hace nada.
UPDATE "user"
SET "rol" = 'ADMIN',
    "area_id" = (SELECT "id" FROM "areas" WHERE "nombre" = 'TODOS')
WHERE "id" = (
	SELECT "id" FROM "user" ORDER BY "created_at" ASC, "id" ASC LIMIT 1
);
