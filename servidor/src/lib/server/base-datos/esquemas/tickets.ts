import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { areas } from './areas.ts';
import { user } from './auth.ts';
import { servicios } from './servicios.ts';

/**
 * Tablas del módulo transversal de tickets.
 *
 * El ticket es una entidad independiente: tiene su propio código, estado,
 * prioridad, área responsable, participantes, conversación y auditoría. Puede
 * originarse en un servicio o ser interno.
 *
 * Decisiones reflejadas en el esquema:
 * - Numeración continua (no anual): `codigoVisible` único.
 * - Un área responsable y varias áreas involucradas por mención.
 * - El usuario asignado es opcional.
 * - El ticket cerrado no reabre: se crea otro ticket con `ticketRelacionadoId`.
 * - La baja de participantes y mensajes es lógica/histórica; no se borra el
 *   historial desde la interfaz.
 */

export const ticketCategorias = pgTable('ticket_categorias', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 90 }).notNull().unique(),
	activo: boolean('activo').notNull().default(true),
	orden: integer('orden').notNull().default(0),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
});

export const tickets = pgTable(
	'tickets',
	{
		id: serial('id').primaryKey(),
		codigoVisible: varchar('codigo_visible', { length: 20 }).notNull(),
		tipoOrigen: varchar('tipo_origen', { length: 10 }).notNull(),
		titulo: varchar('titulo', { length: 200 }).notNull(),
		descripcion: text('descripcion').notNull(),
		categoriaId: integer('categoria_id').references(() => ticketCategorias.id, {
			onDelete: 'set null'
		}),
		estado: varchar('estado', { length: 20 }).notNull().default('NUEVO'),
		prioridad: varchar('prioridad', { length: 10 }).notNull().default('NORMAL'),
		areaResponsableId: integer('area_responsable_id')
			.notNull()
			.references(() => areas.id),
		usuarioAsignadoId: text('usuario_asignado_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		areaSolicitanteId: integer('area_solicitante_id').references(() => areas.id, {
			onDelete: 'set null'
		}),
		servicioId: integer('servicio_id').references(() => servicios.id, {
			onDelete: 'set null'
		}),
		periodoCobranzaId: integer('periodo_cobranza_id'),
		facturaCobranzaIds: integer('factura_cobranza_ids')
			.array()
			.notNull()
			.default(sql`'{}'::integer[]`),
		referenciaTexto: text('referencia_texto'),
		ticketRelacionadoId: integer('ticket_relacionado_id').references(
			(): AnyPgColumn => tickets.id,
			{ onDelete: 'set null' }
		),
		tipoRelacion: varchar('tipo_relacion', { length: 20 }),
		fechaCreacion: timestamp('fecha_creacion', { withTimezone: true }).notNull().defaultNow(),
		fechaActualizacion: timestamp('fecha_actualizacion', { withTimezone: true })
			.notNull()
			.defaultNow(),
		fechaLimite: timestamp('fecha_limite', { withTimezone: true }),
		fechaResolucion: timestamp('fecha_resolucion', { withTimezone: true }),
		fechaCierre: timestamp('fecha_cierre', { withTimezone: true }),
		resolucion: text('resolucion'),
		motivoCierre: text('motivo_cierre'),
		motivoReapertura: text('motivo_reapertura'),
		validadoEn: timestamp('validado_en', { withTimezone: true }),
		validadoPorUsuarioId: text('validado_por_usuario_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		esperaDeAreaId: integer('espera_de_area_id').references(() => areas.id, {
			onDelete: 'set null'
		}),
		esperaDeUsuarioId: text('espera_de_usuario_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		esperaDetalle: text('espera_detalle'),
		creadoPorUsuarioId: text('creado_por_usuario_id')
			.notNull()
			.references(() => user.id),
		version: integer('version').notNull().default(1)
	},
	(t) => [
		uniqueIndex('tickets_codigo_visible_uq').on(t.codigoVisible),
		index('tickets_estado_idx').on(t.estado),
		index('tickets_area_responsable_idx').on(t.areaResponsableId),
		index('tickets_asignado_idx').on(t.usuarioAsignadoId),
		index('tickets_servicio_idx').on(t.servicioId),
		index('tickets_actualizacion_idx').on(t.fechaActualizacion)
	]
);

export const ticketCorreos = pgTable(
	'ticket_correos',
	{
		id: serial('id').primaryKey(),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		direccion: varchar('direccion', { length: 10 }).notNull(),
		threadId: varchar('thread_id', { length: 200 }),
		messageId: varchar('message_id', { length: 300 }),
		inReplyTo: varchar('in_reply_to', { length: 300 }),
		de: varchar('de', { length: 250 }),
		para: text('para'),
		cc: text('cc'),
		asunto: text('asunto'),
		cuerpo: text('cuerpo'),
		fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
		estado: varchar('estado', { length: 30 }).notNull().default('REGISTRADO'),
		usuarioId: text('usuario_id').references(() => user.id, { onDelete: 'set null' }),
		metadata: jsonb('metadata'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('ticket_correos_ticket_idx').on(t.ticketId),
		index('ticket_correos_thread_idx').on(t.threadId),
		index('ticket_correos_message_idx').on(t.messageId)
	]
);

export const ticketCorreoEnvios = pgTable(
	'ticket_correo_envios',
	{
		id: serial('id').primaryKey(),
		correoId: integer('correo_id')
			.notNull()
			.references(() => ticketCorreos.id, { onDelete: 'cascade' }),
		destinatario: varchar('destinatario', { length: 200 }).notNull(),
		gmailMessageId: varchar('gmail_message_id', { length: 200 }),
		messageIdHeader: varchar('message_id_header', { length: 300 }),
		threadId: varchar('thread_id', { length: 200 }),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('ticket_correo_envios_correo_idx').on(t.correoId),
		index('ticket_correo_envios_gmail_idx').on(t.gmailMessageId)
	]
);

export const ticketEnlacesPublicos = pgTable(
	'ticket_enlaces_publicos',
	{
		id: serial('id').primaryKey(),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		email: varchar('email', { length: 200 }),
		tokenHash: varchar('token_hash', { length: 64 }).notNull(),
		expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
		revocadoEn: timestamp('revocado_en', { withTimezone: true }),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		ultimoUsoEn: timestamp('ultimo_uso_en', { withTimezone: true }),
		usos: integer('usos').notNull().default(0)
	},
	(t) => [
		uniqueIndex('ticket_enlaces_token_uq').on(t.tokenHash),
		index('ticket_enlaces_ticket_idx').on(t.ticketId)
	]
);

export const ticketParticipantes = pgTable(
	'ticket_participantes',
	{
		id: serial('id').primaryKey(),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		tipo: varchar('tipo', { length: 10 }).notNull(),
		areaId: integer('area_id').references(() => areas.id, { onDelete: 'set null' }),
		usuarioId: text('usuario_id').references(() => user.id, { onDelete: 'set null' }),
		origen: varchar('origen', { length: 15 }).notNull(),
		fechaIncorporacion: timestamp('fecha_incorporacion', { withTimezone: true })
			.notNull()
			.defaultNow(),
		incorporadoPor: text('incorporado_por'),
		activo: boolean('activo').notNull().default(true)
	},
	(t) => [
		index('ticket_participantes_ticket_idx').on(t.ticketId),
		index('ticket_participantes_area_idx').on(t.areaId),
		index('ticket_participantes_usuario_idx').on(t.usuarioId),
		uniqueIndex('ticket_participantes_area_uq')
			.on(t.ticketId, t.areaId)
			.where(sql`${t.areaId} is not null`),
		uniqueIndex('ticket_participantes_usuario_uq')
			.on(t.ticketId, t.usuarioId)
			.where(sql`${t.usuarioId} is not null`)
	]
);

export const ticketMensajes = pgTable(
	'ticket_mensajes',
	{
		id: serial('id').primaryKey(),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		autorUsuarioId: text('autor_usuario_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		autorNombre: varchar('autor_nombre', { length: 160 }),
		autorEmail: varchar('autor_email', { length: 200 }),
		tipo: varchar('tipo', { length: 15 }).notNull().default('COMENTARIO'),
		contenido: text('contenido').notNull(),
		fechaHora: timestamp('fecha_hora', { withTimezone: true }).notNull().defaultNow(),
		editado: boolean('editado').notNull().default(false),
		fechaEdicion: timestamp('fecha_edicion', { withTimezone: true }),
		menciones: text('menciones').array().notNull().default(sql`'{}'::text[]`),
		canal: varchar('canal', { length: 10 }).notNull().default('APP'),
		visibleCliente: boolean('visible_cliente').notNull().default(true),
		correoId: integer('correo_id').references(() => ticketCorreos.id, {
			onDelete: 'set null'
		}),
		metadata: jsonb('metadata')
	},
	(t) => [
		index('ticket_mensajes_ticket_idx').on(t.ticketId, t.fechaHora),
		index('ticket_mensajes_autor_idx').on(t.autorUsuarioId)
	]
);

export const ticketEventos = pgTable(
	'ticket_eventos',
	{
		id: serial('id').primaryKey(),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		tipoEvento: varchar('tipo_evento', { length: 40 }).notNull(),
		usuarioId: text('usuario_id').references(() => user.id, { onDelete: 'set null' }),
		usuarioNombre: varchar('usuario_nombre', { length: 160 }),
		fechaHora: timestamp('fecha_hora', { withTimezone: true }).notNull().defaultNow(),
		valorAnterior: text('valor_anterior'),
		valorNuevo: text('valor_nuevo'),
		detalle: text('detalle'),
		metadata: jsonb('metadata')
	},
	(t) => [index('ticket_eventos_ticket_idx').on(t.ticketId, t.fechaHora)]
);

export const ticketLecturas = pgTable(
	'ticket_lecturas',
	{
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		usuarioId: text('usuario_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		ultimaLectura: timestamp('ultima_lectura', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		uniqueIndex('ticket_lecturas_uq').on(t.ticketId, t.usuarioId),
		index('ticket_lecturas_usuario_idx').on(t.usuarioId)
	]
);

export const ticketNotificaciones = pgTable(
	'ticket_notificaciones',
	{
		id: serial('id').primaryKey(),
		ticketId: integer('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		usuarioId: text('usuario_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		tipo: varchar('tipo', { length: 40 }).notNull(),
		titulo: varchar('titulo', { length: 200 }).notNull(),
		detalle: text('detalle'),
		actorUsuarioId: text('actor_usuario_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		claveEvento: varchar('clave_evento', { length: 160 }).notNull(),
		leidoEn: timestamp('leido_en', { withTimezone: true }),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('ticket_notificaciones_evento_uq').on(t.ticketId, t.usuarioId, t.claveEvento),
		index('ticket_notificaciones_usuario_idx').on(t.usuarioId, t.leidoEn)
	]
);

export type Ticket = typeof tickets.$inferSelect;
export type TicketNuevo = typeof tickets.$inferInsert;
export type TicketCategoria = typeof ticketCategorias.$inferSelect;
export type TicketParticipante = typeof ticketParticipantes.$inferSelect;
export type TicketMensaje = typeof ticketMensajes.$inferSelect;
export type TicketEvento = typeof ticketEventos.$inferSelect;
export type TicketCorreo = typeof ticketCorreos.$inferSelect;
export type TicketCorreoEnvio = typeof ticketCorreoEnvios.$inferSelect;
export type TicketEnlacePublico = typeof ticketEnlacesPublicos.$inferSelect;
export type TicketNotificacion = typeof ticketNotificaciones.$inferSelect;
