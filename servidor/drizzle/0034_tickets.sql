-- Módulo transversal de tickets.
--
-- Entidad independiente del servicio: puede ser SERVICIO o INTERNO, tiene su
-- propio código continuo, estado, prioridad, área responsable, participantes,
-- conversación, eventos de auditoría y correos.
--
-- Reglas de negocio que se apoyan en este esquema:
-- - Una sola área responsable; las áreas involucradas son participantes.
-- - El usuario asignado es opcional; el área responsable es obligatoria en v1.
-- - Un ticket cerrado no se reabre: se crea otro con ticket_relacionado_id.
-- - Los mensajes/eventos no se borran; la baja de participantes es lógica.

CREATE TABLE "ticket_categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(90) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_categorias_nombre_unique" UNIQUE("nombre")
);

CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo_visible" varchar(20) NOT NULL,
	"tipo_origen" varchar(10) NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"descripcion" text NOT NULL,
	"categoria_id" integer,
	"estado" varchar(20) DEFAULT 'NUEVO' NOT NULL,
	"prioridad" varchar(10) DEFAULT 'NORMAL' NOT NULL,
	"area_responsable_id" integer NOT NULL,
	"usuario_asignado_id" text,
	"area_solicitante_id" integer,
	"servicio_id" integer,
	"periodo_cobranza_id" integer,
	"factura_cobranza_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"referencia_texto" text,
	"ticket_relacionado_id" integer,
	"tipo_relacion" varchar(20),
	"fecha_creacion" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_actualizacion" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_limite" timestamp with time zone,
	"fecha_resolucion" timestamp with time zone,
	"fecha_cierre" timestamp with time zone,
	"resolucion" text,
	"motivo_cierre" text,
	"creado_por_usuario_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);

CREATE UNIQUE INDEX "tickets_codigo_visible_uq" ON "tickets" USING btree ("codigo_visible");
CREATE INDEX "tickets_estado_idx" ON "tickets" USING btree ("estado");
CREATE INDEX "tickets_area_responsable_idx" ON "tickets" USING btree ("area_responsable_id");
CREATE INDEX "tickets_asignado_idx" ON "tickets" USING btree ("usuario_asignado_id");
CREATE INDEX "tickets_servicio_idx" ON "tickets" USING btree ("servicio_id");
CREATE INDEX "tickets_actualizacion_idx" ON "tickets" USING btree ("fecha_actualizacion");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_categoria_id_ticket_categorias_id_fk"
	FOREIGN KEY ("categoria_id") REFERENCES "public"."ticket_categorias"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_area_responsable_id_areas_id_fk"
	FOREIGN KEY ("area_responsable_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_usuario_asignado_id_user_id_fk"
	FOREIGN KEY ("usuario_asignado_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_area_solicitante_id_areas_id_fk"
	FOREIGN KEY ("area_solicitante_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_servicio_id_servicios_id_fk"
	FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_periodo_cobranza_id_periodos_cobranza_id_fk"
	FOREIGN KEY ("periodo_cobranza_id") REFERENCES "public"."periodos_cobranza"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_relacionado_id_tickets_id_fk"
	FOREIGN KEY ("ticket_relacionado_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_creado_por_usuario_id_user_id_fk"
	FOREIGN KEY ("creado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "ticket_correos" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"direccion" varchar(10) NOT NULL,
	"thread_id" varchar(200),
	"message_id" varchar(300),
	"in_reply_to" varchar(300),
	"de" varchar(250),
	"para" text,
	"cc" text,
	"asunto" text,
	"cuerpo" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" varchar(30) DEFAULT 'REGISTRADO' NOT NULL,
	"usuario_id" text,
	"metadata" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "ticket_correos_ticket_idx" ON "ticket_correos" USING btree ("ticket_id");
CREATE INDEX "ticket_correos_thread_idx" ON "ticket_correos" USING btree ("thread_id");
CREATE INDEX "ticket_correos_message_idx" ON "ticket_correos" USING btree ("message_id");

ALTER TABLE "ticket_correos" ADD CONSTRAINT "ticket_correos_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ticket_correos" ADD CONSTRAINT "ticket_correos_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "ticket_participantes" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"tipo" varchar(10) NOT NULL,
	"area_id" integer,
	"usuario_id" text,
	"origen" varchar(15) NOT NULL,
	"fecha_incorporacion" timestamp with time zone DEFAULT now() NOT NULL,
	"incorporado_por" text,
	"activo" boolean DEFAULT true NOT NULL
);

CREATE INDEX "ticket_participantes_ticket_idx" ON "ticket_participantes" USING btree ("ticket_id");
CREATE INDEX "ticket_participantes_area_idx" ON "ticket_participantes" USING btree ("area_id");
CREATE INDEX "ticket_participantes_usuario_idx" ON "ticket_participantes" USING btree ("usuario_id");
CREATE UNIQUE INDEX "ticket_participantes_area_uq" ON "ticket_participantes" USING btree ("ticket_id","area_id") WHERE "area_id" IS NOT NULL;
CREATE UNIQUE INDEX "ticket_participantes_usuario_uq" ON "ticket_participantes" USING btree ("ticket_id","usuario_id") WHERE "usuario_id" IS NOT NULL;

ALTER TABLE "ticket_participantes" ADD CONSTRAINT "ticket_participantes_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ticket_participantes" ADD CONSTRAINT "ticket_participantes_area_id_areas_id_fk"
	FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "ticket_participantes" ADD CONSTRAINT "ticket_participantes_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "ticket_mensajes" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"autor_usuario_id" text,
	"autor_nombre" varchar(160),
	"autor_email" varchar(200),
	"tipo" varchar(15) DEFAULT 'COMENTARIO' NOT NULL,
	"contenido" text NOT NULL,
	"fecha_hora" timestamp with time zone DEFAULT now() NOT NULL,
	"editado" boolean DEFAULT false NOT NULL,
	"fecha_edicion" timestamp with time zone,
	"menciones" text[] DEFAULT '{}'::text[] NOT NULL,
	"canal" varchar(10) DEFAULT 'APP' NOT NULL,
	"correo_id" integer,
	"metadata" jsonb
);

CREATE INDEX "ticket_mensajes_ticket_idx" ON "ticket_mensajes" USING btree ("ticket_id","fecha_hora");
CREATE INDEX "ticket_mensajes_autor_idx" ON "ticket_mensajes" USING btree ("autor_usuario_id");

ALTER TABLE "ticket_mensajes" ADD CONSTRAINT "ticket_mensajes_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ticket_mensajes" ADD CONSTRAINT "ticket_mensajes_autor_usuario_id_user_id_fk"
	FOREIGN KEY ("autor_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "ticket_mensajes" ADD CONSTRAINT "ticket_mensajes_correo_id_ticket_correos_id_fk"
	FOREIGN KEY ("correo_id") REFERENCES "public"."ticket_correos"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "ticket_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"tipo_evento" varchar(40) NOT NULL,
	"usuario_id" text,
	"usuario_nombre" varchar(160),
	"fecha_hora" timestamp with time zone DEFAULT now() NOT NULL,
	"valor_anterior" text,
	"valor_nuevo" text,
	"detalle" text,
	"metadata" jsonb
);

CREATE INDEX "ticket_eventos_ticket_idx" ON "ticket_eventos" USING btree ("ticket_id","fecha_hora");

ALTER TABLE "ticket_eventos" ADD CONSTRAINT "ticket_eventos_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ticket_eventos" ADD CONSTRAINT "ticket_eventos_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "ticket_lecturas" (
	"ticket_id" integer NOT NULL,
	"usuario_id" text NOT NULL,
	"ultima_lectura" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "ticket_lecturas_uq" ON "ticket_lecturas" USING btree ("ticket_id","usuario_id");
CREATE INDEX "ticket_lecturas_usuario_idx" ON "ticket_lecturas" USING btree ("usuario_id");

ALTER TABLE "ticket_lecturas" ADD CONSTRAINT "ticket_lecturas_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ticket_lecturas" ADD CONSTRAINT "ticket_lecturas_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "ticket_notificaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"usuario_id" text NOT NULL,
	"tipo" varchar(40) NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"detalle" text,
	"actor_usuario_id" text,
	"clave_evento" varchar(160) NOT NULL,
	"leido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "ticket_notificaciones_evento_uq" ON "ticket_notificaciones" USING btree ("ticket_id","usuario_id","clave_evento");
CREATE INDEX "ticket_notificaciones_usuario_idx" ON "ticket_notificaciones" USING btree ("usuario_id","leido_en");

ALTER TABLE "ticket_notificaciones" ADD CONSTRAINT "ticket_notificaciones_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ticket_notificaciones" ADD CONSTRAINT "ticket_notificaciones_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ticket_notificaciones" ADD CONSTRAINT "ticket_notificaciones_actor_usuario_id_user_id_fk"
	FOREIGN KEY ("actor_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
