import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar
} from 'drizzle-orm/pg-core';
import { areas } from './areas.ts';
import { user } from './auth.ts';
import { comprobantesCobranza } from './cobranzas.ts';
import { servicios } from './servicios.ts';
import { tickets } from './tickets.ts';

/**
 * Tablas del Centro de seguimiento de cobranza.
 *
 * Un seguimiento es un caso formal de cobranza atado a un servicio y a un
 * conjunto ELEGIDO de comprobantes. No reemplaza la cartera: la explica.
 *
 * Decisiones reflejadas en el esquema:
 * - Código visible anual: SEG-AAAA-NNNNNN, con secuencia propia.
 * - Varios seguimientos activos por servicio; nunca se mezclan sus historiales.
 * - El estado principal es del caso; la próxima gestión es una tarea aparte y
 *   el estado del ticket transversal nunca se copia acá.
 * - Los comprobantes se asocian individualmente y se retiran de forma lógica.
 * - Nada del historial se borra: correcciones y retiros quedan auditados.
 * - Los correos se vinculan por hilo/encabezados; si no hay coincidencia segura
 *   quedan en la bandeja de sin vincular.
 */

export const seguimientos = pgTable(
	'seguimientos',
	{
		id: serial('id').primaryKey(),
		codigoVisible: varchar('codigo_visible', { length: 20 }).notNull(),
		servicioId: integer('servicio_id')
			.notNull()
			.references(() => servicios.id),
		areaId: integer('area_id')
			.notNull()
			.references(() => areas.id),
		titulo: varchar('titulo', { length: 200 }).notNull(),
		motivo: text('motivo'),
		estado: varchar('estado', { length: 30 }).notNull().default('EN_SEGUIMIENTO'),
		prioridad: varchar('prioridad', { length: 10 }).notNull().default('NORMAL'),
		responsableUsuarioId: text('responsable_usuario_id')
			.notNull()
			.references(() => user.id),
		canalPreferido: varchar('canal_preferido', { length: 20 }),
		// Snapshot del celular del servicio al abrir el caso: es la llave con la
		// que el servicio de WhatsApp decide si guarda un mensaje. Editable para
		// corregir el contacto sin tocar el servicio.
		telefonoWhatsapp: varchar('telefono_whatsapp', { length: 20 }),
		// Se completa cuando onWhatsApp confirma que el número existe.
		telefonoWhatsappVerificadoEn: timestamp('telefono_whatsapp_verificado_en', {
			withTimezone: true
		}),
		fechaApertura: timestamp('fecha_apertura', { withTimezone: true }).notNull().defaultNow(),
		fechaCierre: timestamp('fecha_cierre', { withTimezone: true }),
		motivoCierre: text('motivo_cierre'),
		ultimaActividad: timestamp('ultima_actividad', { withTimezone: true }).notNull().defaultNow(),
		ultimoContactoEn: timestamp('ultimo_contacto_en', { withTimezone: true }),
		ultimoCanal: varchar('ultimo_canal', { length: 20 }),
		creadoPorUsuarioId: text('creado_por_usuario_id')
			.notNull()
			.references(() => user.id),
		actualizadoPorUsuarioId: text('actualizado_por_usuario_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		version: integer('version').notNull().default(1)
	},
	(t) => [
		uniqueIndex('seguimientos_codigo_visible_uq').on(t.codigoVisible),
		index('seguimientos_servicio_idx').on(t.servicioId),
		index('seguimientos_estado_idx').on(t.estado),
		index('seguimientos_responsable_idx').on(t.responsableUsuarioId),
		index('seguimientos_area_idx').on(t.areaId),
		index('seguimientos_actividad_idx').on(t.ultimaActividad),
		// Lista blanca de WhatsApp: buscar los casos activos de un teléfono.
		index('seguimientos_telefono_whatsapp_idx').on(t.telefonoWhatsapp)
	]
);

export const seguimientosParticipantes = pgTable(
	'seguimientos_participantes',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		usuarioId: text('usuario_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** RESPONSABLE | OBSERVADOR */
		rol: varchar('rol', { length: 20 }).notNull().default('OBSERVADOR'),
		activo: boolean('activo').notNull().default(true),
		fechaIncorporacion: timestamp('fecha_incorporacion', { withTimezone: true })
			.notNull()
			.defaultNow(),
		incorporadoPor: text('incorporado_por')
	},
	(t) => [
		uniqueIndex('seguimientos_participantes_uq').on(t.seguimientoId, t.usuarioId),
		index('seguimientos_participantes_usuario_idx').on(t.usuarioId)
	]
);

export const seguimientosFacturas = pgTable(
	'seguimientos_facturas',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		comprobanteId: integer('comprobante_id')
			.notNull()
			.references(() => comprobantesCobranza.id),
		/** Clave estable del comprobante para encontrar su saldo más reciente. */
		claveOrigen: text('clave_origen').notNull(),
		saldoAlAsociar: numeric('saldo_al_asociar', { precision: 18, scale: 2 }).notNull(),
		activa: boolean('activa').notNull().default(true),
		fechaAsociacion: timestamp('fecha_asociacion', { withTimezone: true }).notNull().defaultNow(),
		asociadaPor: text('asociada_por'),
		fechaRetiro: timestamp('fecha_retiro', { withTimezone: true }),
		retiradaPor: text('retirada_por'),
		motivoRetiro: text('motivo_retiro')
	},
	(t) => [
		uniqueIndex('seguimientos_facturas_activa_uq')
			.on(t.seguimientoId, t.comprobanteId)
			.where(sql`${t.activa} = true`),
		index('seguimientos_facturas_seguimiento_idx').on(t.seguimientoId)
	]
);

export const seguimientosEventos = pgTable(
	'seguimientos_eventos',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		/** CREACION | NOTA | CORREO | WHATSAPP | LLAMADA | REUNION | ESTADO |
		 * PRIORIDAD | RESPONSABLE | TAREA | PROMESA | TICKET | FACTURA |
		 * CIERRE | REAPERTURA | SISTEMA */
		tipo: varchar('tipo', { length: 30 }).notNull(),
		/** NOTA | CORREO | WHATSAPP | TELEFONO | REUNION | SISTEMA | OTRO */
		canal: varchar('canal', { length: 20 }).notNull().default('NOTA'),
		/** ENTRANTE | SALIENTE | INTERNA */
		direccion: varchar('direccion', { length: 10 }).notNull().default('INTERNA'),
		contenido: text('contenido').notNull(),
		autorUsuarioId: text('autor_usuario_id').references(() => user.id, { onDelete: 'set null' }),
		autorNombre: varchar('autor_nombre', { length: 160 }),
		/** Contacto externo que originó el evento (cliente, proveedor, etc.). */
		contacto: varchar('contacto', { length: 200 }),
		fechaHora: timestamp('fecha_hora', { withTimezone: true }).notNull().defaultNow(),
		adjuntos: jsonb('adjuntos').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
		metadatos: jsonb('metadatos'),
		visibleCliente: boolean('visible_cliente').notNull().default(false),
		estadoEntrega: varchar('estado_entrega', { length: 30 }),
		correoId: integer('correo_id').references(() => seguimientosCorreos.id, {
			onDelete: 'set null'
		}),
		tareaId: integer('tarea_id').references(() => seguimientosTareas.id, {
			onDelete: 'set null'
		}),
		promesaId: integer('promesa_id').references(() => seguimientosPromesas.id, {
			onDelete: 'set null'
		}),
		ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
		editado: boolean('editado').notNull().default(false),
		fechaEdicion: timestamp('fecha_edicion', { withTimezone: true }),
		editadoPor: text('editado_por')
	},
	(t) => [
		index('seguimientos_eventos_seguimiento_idx').on(t.seguimientoId, t.fechaHora),
		index('seguimientos_eventos_correo_idx').on(t.correoId),
		index('seguimientos_eventos_ticket_idx').on(t.ticketId)
	]
);

export const seguimientosTareas = pgTable(
	'seguimientos_tareas',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		/** CORREO | WHATSAPP | LLAMADA | CONFIRMAR_PAGO | VALIDAR_COMPROBANTE |
		 * VERIFICAR_ACREDITACION | REVISAR_TICKET | OTRA */
		tipoAccion: varchar('tipo_accion', { length: 30 }).notNull(),
		titulo: varchar('titulo', { length: 200 }).notNull(),
		nota: text('nota'),
		fechaHora: timestamp('fecha_hora', { withTimezone: true }).notNull(),
		responsableUsuarioId: text('responsable_usuario_id')
			.notNull()
			.references(() => user.id),
		/** Minutos antes del vencimiento; 0 = en el momento. */
		recordatorioMinutos: integer('recordatorio_minutos').notNull().default(0),
		canalPrevisto: varchar('canal_previsto', { length: 20 }),
		/** PENDIENTE | COMPLETADA | REPROGRAMADA | CANCELADA */
		estado: varchar('estado', { length: 20 }).notNull().default('PENDIENTE'),
		resultado: text('resultado'),
		fechaCompletada: timestamp('fecha_completada', { withTimezone: true }),
		completadaPor: text('completada_por'),
		motivoCancelacion: text('motivo_cancelacion'),
		reprogramadaDeId: integer('reprogramada_de_id'),
		creadoPor: text('creado_por'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1)
	},
	(t) => [
		index('seguimientos_tareas_seguimiento_idx').on(t.seguimientoId, t.fechaHora),
		index('seguimientos_tareas_responsable_idx').on(t.responsableUsuarioId, t.estado)
	]
);

export const seguimientosPromesas = pgTable(
	'seguimientos_promesas',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		fechaPrometida: timestamp('fecha_prometida', { withTimezone: true }).notNull(),
		importe: numeric('importe', { precision: 18, scale: 2 }).notNull(),
		moneda: varchar('moneda', { length: 3 }).notNull(),
		comprobanteIds: integer('comprobante_ids')
			.array()
			.notNull()
			.default(sql`'{}'::integer[]`),
		medioPago: varchar('medio_pago', { length: 60 }),
		confirmadoPorContacto: varchar('confirmado_por_contacto', { length: 160 }),
		canal: varchar('canal', { length: 20 }),
		observaciones: text('observaciones'),
		/** VIGENTE | CUMPLIDA | CUMPLIDA_PARCIAL | INCUMPLIDA | REPROGRAMADA | CANCELADA */
		estado: varchar('estado', { length: 20 }).notNull().default('VIGENTE'),
		resultadoDetalle: text('resultado_detalle'),
		confirmadoPorUsuarioId: text('confirmado_por_usuario_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		fechaConfirmacion: timestamp('fecha_confirmacion', { withTimezone: true }),
		creadoPor: text('creado_por'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1)
	},
	(t) => [index('seguimientos_promesas_seguimiento_idx').on(t.seguimientoId, t.fechaPrometida)]
);

export const seguimientosTickets = pgTable(
	'seguimientos_tickets',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		bloqueante: boolean('bloqueante').notNull().default(false),
		motivoBloqueo: text('motivo_bloqueo'),
		creadoPor: text('creado_por'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('seguimientos_tickets_uq').on(t.seguimientoId, t.ticketId),
		index('seguimientos_tickets_ticket_idx').on(t.ticketId)
	]
);

export const seguimientosCorreos = pgTable(
	'seguimientos_correos',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id').references(() => seguimientos.id, {
			onDelete: 'set null'
		}),
		servicioId: integer('servicio_id').references(() => servicios.id, { onDelete: 'set null' }),
		cuentaId: integer('cuenta_id'),
		aliasId: integer('alias_id'),
		/** SMTP | GMAIL */
		proveedor: varchar('proveedor', { length: 20 }).notNull().default('SMTP'),
		/** ENTRANTE | SALIENTE */
		direccion: varchar('direccion', { length: 10 }).notNull(),
		gmailMessageId: varchar('gmail_message_id', { length: 300 }),
		threadId: varchar('thread_id', { length: 200 }),
		historyId: varchar('history_id', { length: 100 }),
		internalDate: timestamp('internal_date', { withTimezone: true }),
		messageIdHeader: varchar('message_id_header', { length: 300 }),
		inReplyTo: varchar('in_reply_to', { length: 300 }),
		referencias: text('referencias'),
		de: varchar('de', { length: 250 }),
		para: text('para'),
		cc: text('cc'),
		asunto: text('asunto'),
		cuerpo: text('cuerpo'),
		fechaHora: timestamp('fecha_hora', { withTimezone: true }).notNull().defaultNow(),
		/** PENDIENTE | AUTOMATICO | MANUAL | DESCARTADO */
		estadoVinculacion: varchar('estado_vinculacion', { length: 20 }).notNull().default('PENDIENTE'),
		vinculadoPor: text('vinculado_por'),
		vinculadoEn: timestamp('vinculado_en', { withTimezone: true }),
		usuarioId: text('usuario_id').references(() => user.id, { onDelete: 'set null' }),
		adjuntos: jsonb('adjuntos').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
		metadatos: jsonb('metadatos'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('seguimientos_correos_seguimiento_idx').on(t.seguimientoId, t.fechaHora),
		index('seguimientos_correos_thread_idx').on(t.threadId),
		index('seguimientos_correos_pendientes_idx').on(t.estadoVinculacion)
	]
);

export const seguimientosLecturas = pgTable(
	'seguimientos_lecturas',
	{
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		usuarioId: text('usuario_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		ultimaLectura: timestamp('ultima_lectura', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('seguimientos_lecturas_uq').on(t.seguimientoId, t.usuarioId),
		index('seguimientos_lecturas_usuario_idx').on(t.usuarioId)
	]
);

export const seguimientosNotificaciones = pgTable(
	'seguimientos_notificaciones',
	{
		id: serial('id').primaryKey(),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		usuarioId: text('usuario_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		tipo: varchar('tipo', { length: 40 }).notNull(),
		titulo: varchar('titulo', { length: 200 }).notNull(),
		detalle: text('detalle'),
		actorUsuarioId: text('actor_usuario_id').references(() => user.id, { onDelete: 'set null' }),
		claveEvento: varchar('clave_evento', { length: 160 }).notNull(),
		leidoEn: timestamp('leido_en', { withTimezone: true }),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('seguimientos_notificaciones_evento_uq').on(
			t.seguimientoId,
			t.usuarioId,
			t.claveEvento
		),
		index('seguimientos_notificaciones_usuario_idx').on(t.usuarioId, t.leidoEn)
	]
);

export type Seguimiento = typeof seguimientos.$inferSelect;
export type SeguimientoNuevo = typeof seguimientos.$inferInsert;
export type SeguimientoParticipante = typeof seguimientosParticipantes.$inferSelect;
export type SeguimientoFactura = typeof seguimientosFacturas.$inferSelect;
export type SeguimientoEvento = typeof seguimientosEventos.$inferSelect;
export type SeguimientoTarea = typeof seguimientosTareas.$inferSelect;
export type SeguimientoPromesa = typeof seguimientosPromesas.$inferSelect;
export type SeguimientoTicket = typeof seguimientosTickets.$inferSelect;
export type SeguimientoCorreo = typeof seguimientosCorreos.$inferSelect;
export type SeguimientoNotificacion = typeof seguimientosNotificaciones.$inferSelect;
