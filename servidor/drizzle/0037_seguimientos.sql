-- Centro de seguimiento de cobranza.
--
-- Un seguimiento es un caso de cobranza atado a un servicio y a un conjunto
-- elegido de comprobantes. Convive con la cartera: no la reemplaza.
--
-- Reglas que se apoyan en este esquema:
-- - Código visible anual SEG-AAAA-NNNNNN, generado con secuencia propia.
-- - Varios seguimientos activos por servicio, con historial independiente.
-- - El estado principal es del caso; la próxima gestión es una tarea aparte.
-- - Los comprobantes se asocian individualmente y se retiran de forma lógica.
-- - Tickets: el vínculo es una referencia; el ticket conserva su módulo.
-- - Correos: se guardan ids de proveedor e hilo para vincular respuestas.
-- - Nada del historial se borra: correcciones y retiros quedan auditados.

CREATE SEQUENCE IF NOT EXISTS "seguimiento_codigo_seq" START 1;

CREATE TABLE "seguimientos" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo_visible" varchar(20) NOT NULL,
	"servicio_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"motivo" text,
	"estado" varchar(30) DEFAULT 'EN_SEGUIMIENTO' NOT NULL,
	"prioridad" varchar(10) DEFAULT 'NORMAL' NOT NULL,
	"responsable_usuario_id" text NOT NULL,
	"canal_preferido" varchar(20),
	"fecha_apertura" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_cierre" timestamp with time zone,
	"motivo_cierre" text,
	"ultima_actividad" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_contacto_en" timestamp with time zone,
	"ultimo_canal" varchar(20),
	"creado_por_usuario_id" text NOT NULL,
	"actualizado_por_usuario_id" text,
	"version" integer DEFAULT 1 NOT NULL
);

CREATE UNIQUE INDEX "seguimientos_codigo_visible_uq" ON "seguimientos" USING btree ("codigo_visible");
CREATE INDEX "seguimientos_servicio_idx" ON "seguimientos" USING btree ("servicio_id");
CREATE INDEX "seguimientos_estado_idx" ON "seguimientos" USING btree ("estado");
CREATE INDEX "seguimientos_responsable_idx" ON "seguimientos" USING btree ("responsable_usuario_id");
CREATE INDEX "seguimientos_area_idx" ON "seguimientos" USING btree ("area_id");
CREATE INDEX "seguimientos_actividad_idx" ON "seguimientos" USING btree ("ultima_actividad");

ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_servicio_id_servicios_id_fk"
	FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_area_id_areas_id_fk"
	FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_responsable_usuario_id_user_id_fk"
	FOREIGN KEY ("responsable_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_creado_por_usuario_id_user_id_fk"
	FOREIGN KEY ("creado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_actualizado_por_usuario_id_user_id_fk"
	FOREIGN KEY ("actualizado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "seguimientos_participantes" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"usuario_id" text NOT NULL,
	"rol" varchar(20) DEFAULT 'OBSERVADOR' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"fecha_incorporacion" timestamp with time zone DEFAULT now() NOT NULL,
	"incorporado_por" text
);

CREATE UNIQUE INDEX "seguimientos_participantes_uq" ON "seguimientos_participantes" USING btree ("seguimiento_id", "usuario_id");
CREATE INDEX "seguimientos_participantes_usuario_idx" ON "seguimientos_participantes" USING btree ("usuario_id");

ALTER TABLE "seguimientos_participantes" ADD CONSTRAINT "seguimientos_participantes_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_participantes" ADD CONSTRAINT "seguimientos_participantes_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "seguimientos_facturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"comprobante_id" integer NOT NULL,
	"clave_origen" text NOT NULL,
	"saldo_al_asociar" numeric(18, 2) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"fecha_asociacion" timestamp with time zone DEFAULT now() NOT NULL,
	"asociada_por" text,
	"fecha_retiro" timestamp with time zone,
	"retirada_por" text,
	"motivo_retiro" text
);

CREATE UNIQUE INDEX "seguimientos_facturas_activa_uq" ON "seguimientos_facturas" USING btree ("seguimiento_id", "comprobante_id") WHERE "activa" = true;
CREATE INDEX "seguimientos_facturas_seguimiento_idx" ON "seguimientos_facturas" USING btree ("seguimiento_id");

ALTER TABLE "seguimientos_facturas" ADD CONSTRAINT "seguimientos_facturas_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_facturas" ADD CONSTRAINT "seguimientos_facturas_comprobante_id_comprobantes_cobranza_id_fk"
	FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobantes_cobranza"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "seguimientos_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"tipo" varchar(30) NOT NULL,
	"canal" varchar(20) DEFAULT 'NOTA' NOT NULL,
	"direccion" varchar(10) DEFAULT 'INTERNA' NOT NULL,
	"contenido" text NOT NULL,
	"autor_usuario_id" text,
	"autor_nombre" varchar(160),
	"contacto" varchar(200),
	"fecha_hora" timestamp with time zone DEFAULT now() NOT NULL,
	"adjuntos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadatos" jsonb,
	"visible_cliente" boolean DEFAULT false NOT NULL,
	"estado_entrega" varchar(30),
	"correo_id" integer,
	"tarea_id" integer,
	"promesa_id" integer,
	"ticket_id" integer,
	"editado" boolean DEFAULT false NOT NULL,
	"fecha_edicion" timestamp with time zone,
	"editado_por" text
);

CREATE INDEX "seguimientos_eventos_seguimiento_idx" ON "seguimientos_eventos" USING btree ("seguimiento_id", "fecha_hora");
CREATE INDEX "seguimientos_eventos_correo_idx" ON "seguimientos_eventos" USING btree ("correo_id");
CREATE INDEX "seguimientos_eventos_ticket_idx" ON "seguimientos_eventos" USING btree ("ticket_id");

ALTER TABLE "seguimientos_eventos" ADD CONSTRAINT "seguimientos_eventos_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_eventos" ADD CONSTRAINT "seguimientos_eventos_autor_usuario_id_user_id_fk"
	FOREIGN KEY ("autor_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "seguimientos_tareas" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"tipo_accion" varchar(30) NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"nota" text,
	"fecha_hora" timestamp with time zone NOT NULL,
	"responsable_usuario_id" text NOT NULL,
	"recordatorio_minutos" integer DEFAULT 0 NOT NULL,
	"canal_previsto" varchar(20),
	"estado" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"resultado" text,
	"fecha_completada" timestamp with time zone,
	"completada_por" text,
	"motivo_cancelacion" text,
	"reprogramada_de_id" integer,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);

CREATE INDEX "seguimientos_tareas_seguimiento_idx" ON "seguimientos_tareas" USING btree ("seguimiento_id", "fecha_hora");
CREATE INDEX "seguimientos_tareas_responsable_idx" ON "seguimientos_tareas" USING btree ("responsable_usuario_id", "estado");

ALTER TABLE "seguimientos_tareas" ADD CONSTRAINT "seguimientos_tareas_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_tareas" ADD CONSTRAINT "seguimientos_tareas_responsable_usuario_id_user_id_fk"
	FOREIGN KEY ("responsable_usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "seguimientos_promesas" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"fecha_prometida" timestamp with time zone NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"moneda" varchar(3) NOT NULL,
	"comprobante_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"medio_pago" varchar(60),
	"confirmado_por_contacto" varchar(160),
	"canal" varchar(20),
	"observaciones" text,
	"estado" varchar(20) DEFAULT 'VIGENTE' NOT NULL,
	"resultado_detalle" text,
	"confirmado_por_usuario_id" text,
	"fecha_confirmacion" timestamp with time zone,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);

CREATE INDEX "seguimientos_promesas_seguimiento_idx" ON "seguimientos_promesas" USING btree ("seguimiento_id", "fecha_prometida");

ALTER TABLE "seguimientos_promesas" ADD CONSTRAINT "seguimientos_promesas_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_promesas" ADD CONSTRAINT "seguimientos_promesas_confirmado_por_usuario_id_user_id_fk"
	FOREIGN KEY ("confirmado_por_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "seguimientos_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	"bloqueante" boolean DEFAULT false NOT NULL,
	"motivo_bloqueo" text,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "seguimientos_tickets_uq" ON "seguimientos_tickets" USING btree ("seguimiento_id", "ticket_id");
CREATE INDEX "seguimientos_tickets_ticket_idx" ON "seguimientos_tickets" USING btree ("ticket_id");

ALTER TABLE "seguimientos_tickets" ADD CONSTRAINT "seguimientos_tickets_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_tickets" ADD CONSTRAINT "seguimientos_tickets_ticket_id_tickets_id_fk"
	FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "seguimientos_correos" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer,
	"servicio_id" integer,
	"cuenta_id" integer,
	"alias_id" integer,
	"proveedor" varchar(20) DEFAULT 'SMTP' NOT NULL,
	"direccion" varchar(10) NOT NULL,
	"gmail_message_id" varchar(300),
	"thread_id" varchar(200),
	"history_id" varchar(100),
	"internal_date" timestamp with time zone,
	"message_id_header" varchar(300),
	"in_reply_to" varchar(300),
	"referencias" text,
	"de" varchar(250),
	"para" text,
	"cc" text,
	"asunto" text,
	"cuerpo" text,
	"fecha_hora" timestamp with time zone DEFAULT now() NOT NULL,
	"estado_vinculacion" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"vinculado_por" text,
	"vinculado_en" timestamp with time zone,
	"usuario_id" text,
	"adjuntos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadatos" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "seguimientos_correos_seguimiento_idx" ON "seguimientos_correos" USING btree ("seguimiento_id", "fecha_hora");
CREATE INDEX "seguimientos_correos_thread_idx" ON "seguimientos_correos" USING btree ("thread_id");
CREATE INDEX "seguimientos_correos_pendientes_idx" ON "seguimientos_correos" USING btree ("estado_vinculacion");

ALTER TABLE "seguimientos_correos" ADD CONSTRAINT "seguimientos_correos_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "seguimientos_correos" ADD CONSTRAINT "seguimientos_correos_servicio_id_servicios_id_fk"
	FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "seguimientos_correos" ADD CONSTRAINT "seguimientos_correos_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "seguimientos_lecturas" (
	"seguimiento_id" integer NOT NULL,
	"usuario_id" text NOT NULL,
	"ultima_lectura" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "seguimientos_lecturas_uq" ON "seguimientos_lecturas" USING btree ("seguimiento_id", "usuario_id");
CREATE INDEX "seguimientos_lecturas_usuario_idx" ON "seguimientos_lecturas" USING btree ("usuario_id");

ALTER TABLE "seguimientos_lecturas" ADD CONSTRAINT "seguimientos_lecturas_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_lecturas" ADD CONSTRAINT "seguimientos_lecturas_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "seguimientos_notificaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"seguimiento_id" integer NOT NULL,
	"usuario_id" text NOT NULL,
	"tipo" varchar(40) NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"detalle" text,
	"actor_usuario_id" text,
	"clave_evento" varchar(160) NOT NULL,
	"leido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "seguimientos_notificaciones_evento_uq" ON "seguimientos_notificaciones" USING btree ("seguimiento_id", "usuario_id", "clave_evento");
CREATE INDEX "seguimientos_notificaciones_usuario_idx" ON "seguimientos_notificaciones" USING btree ("usuario_id", "leido_en");

ALTER TABLE "seguimientos_notificaciones" ADD CONSTRAINT "seguimientos_notificaciones_seguimiento_id_seguimientos_id_fk"
	FOREIGN KEY ("seguimiento_id") REFERENCES "public"."seguimientos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_notificaciones" ADD CONSTRAINT "seguimientos_notificaciones_usuario_id_user_id_fk"
	FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seguimientos_notificaciones" ADD CONSTRAINT "seguimientos_notificaciones_actor_usuario_id_user_id_fk"
	FOREIGN KEY ("actor_usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
