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
	varchar
} from 'drizzle-orm/pg-core';
import { user } from './auth.ts';
import { seguimientos } from './seguimientos.ts';

/**
 * Tabla: whatsapp_sesion
 *
 * Estado de la ÚNICA sesión de WhatsApp Web de la empresa (un número
 * uruguayo). Es una fila fija (id = 1): el socket de Baileys vive en el
 * proceso de la API y se vincula una sola vez por despliegue.
 *
 * El QR NO se persiste: cambia cada ~20 segundos y es material sensible. Vive
 * en memoria y se entrega por la API mientras la sesión está esperando
 * vinculación.
 *
 * `estado` refleja lo que ve el usuario en Configuración:
 * - DESCONECTADO: nunca se vinculó o se cerró desde la UI.
 * - ESPERANDO_QR: hay un socket abierto esperando que se escanee el QR.
 * - CONECTADO: sesión activa, puede enviar y recibir.
 * - RECONECTANDO: se cayó la conexión y el gestor está reintentando.
 * - CERRADO: WhatsApp invalidó la sesión (logout remoto); requiere QR nuevo.
 */
export const ESTADOS_SESION_WHATSAPP = [
	'DESCONECTADO',
	'ESPERANDO_QR',
	'CONECTADO',
	'RECONECTANDO',
	'CERRADO'
] as const;

export type EstadoSesionWhatsApp = (typeof ESTADOS_SESION_WHATSAPP)[number];

export const whatsappSesion = pgTable('whatsapp_sesion', {
	id: integer('id').primaryKey().default(1),
	// Número vinculado en formato E.164 sin '+' (ej.: 59899123456).
	numeroTelefono: varchar('numero_telefono', { length: 20 }),
	estado: varchar('estado', { length: 24 })
		.$type<EstadoSesionWhatsApp>()
		.notNull()
		.default('DESCONECTADO'),
	ultimoError: text('ultimo_error'),
	conectadoEn: timestamp('conectado_en', { withTimezone: true }),
	desconectadoEn: timestamp('desconectado_en', { withTimezone: true }),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
});

export type WhatsAppSesion = typeof whatsappSesion.$inferSelect;

export const DIRECCIONES_MENSAJE_WHATSAPP = ['ENTRANTE', 'SALIENTE'] as const;
export type DireccionMensajeWhatsApp = (typeof DIRECCIONES_MENSAJE_WHATSAPP)[number];

export const TIPOS_MENSAJE_WHATSAPP = [
	'TEXTO',
	'DOCUMENTO',
	'IMAGEN',
	'AUDIO',
	'VIDEO',
	'STICKER',
	'OTRO'
] as const;
export type TipoMensajeWhatsApp = (typeof TIPOS_MENSAJE_WHATSAPP)[number];

export const ESTADOS_MENSAJE_WHATSAPP = [
	'RECIBIDO',
	'ENVIADO',
	'ENTREGADO',
	'LEIDO',
	'FALLIDO'
] as const;
export type EstadoMensajeWhatsApp = (typeof ESTADOS_MENSAJE_WHATSAPP)[number];

/**
 * Tabla: whatsapp_mensajes
 *
 * Espejo canónico de los mensajes del número de la empresa que pertenecen a
 * algún seguimiento. `wa_id` es el id de WhatsApp del mensaje: es la llave de
 * deduplicación (el eco de un saliente vuelve a entrar como `fromMe`).
 *
 * `telefono` es el contacto en formato canónico (598 + 8 dígitos) y `jid` el
 * JID con el que se responde. Se guardan ambos porque WhatsApp ya entrega
 * algunos contactos identificados por LID.
 */
export const whatsappMensajes = pgTable(
	'whatsapp_mensajes',
	{
		id: serial('id').primaryKey(),
		waId: varchar('wa_id', { length: 120 }).notNull(),
		telefono: varchar('telefono', { length: 20 }).notNull(),
		jid: varchar('jid', { length: 80 }).notNull(),
		lid: varchar('lid', { length: 80 }),
		direccion: varchar('direccion', { length: 10 })
			.$type<DireccionMensajeWhatsApp>()
			.notNull(),
		tipo: varchar('tipo', { length: 20 }).$type<TipoMensajeWhatsApp>().notNull().default('TEXTO'),
		texto: text('texto'),
		nombreArchivo: varchar('nombre_archivo', { length: 200 }),
		mimetype: varchar('mimetype', { length: 120 }),
		estado: varchar('estado', { length: 20 })
			.$type<EstadoMensajeWhatsApp>()
			.notNull()
			.default('RECIBIDO'),
		/** Usuario del CRM que lo envió; null si vino del teléfono o entrante. */
		enviadoPorUsuarioId: text('enviado_por_usuario_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		/** true si lo escribió el equipo desde el teléfono (fromMe). */
		desdeTelefono: boolean('desde_telefono').notNull().default(false),
		enviadoEn: timestamp('enviado_en', { withTimezone: true }).notNull(),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		metadatos: jsonb('metadatos')
	},
	(t) => [
		uniqueIndex('whatsapp_mensajes_wa_id_uq').on(t.waId),
		index('whatsapp_mensajes_telefono_idx').on(t.telefono, t.enviadoEn),
		index('whatsapp_mensajes_enviado_idx').on(t.enviadoEn)
	]
);

export type WhatsAppMensaje = typeof whatsappMensajes.$inferSelect;

/**
 * Tabla: whatsapp_mensajes_seguimientos
 *
 * Vincula un mensaje con uno o más casos. Es N:M a propósito: si el mismo
 * celular está en dos seguimientos activos, el mensaje se registra en ambos y
 * el usuario puede desvincularlo del caso equivocado sin borrar el original.
 */
export const whatsappMensajesSeguimientos = pgTable(
	'whatsapp_mensajes_seguimientos',
	{
		id: serial('id').primaryKey(),
		mensajeId: integer('mensaje_id')
			.notNull()
			.references(() => whatsappMensajes.id, { onDelete: 'cascade' }),
		seguimientoId: integer('seguimiento_id')
			.notNull()
			.references(() => seguimientos.id, { onDelete: 'cascade' }),
		vinculadoEn: timestamp('vinculado_en', { withTimezone: true }).notNull().defaultNow(),
		desvinculadoEn: timestamp('desvinculado_en', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('whatsapp_mensajes_seguimientos_uq').on(t.mensajeId, t.seguimientoId),
		index('whatsapp_mensajes_seguimientos_caso_idx').on(t.seguimientoId, t.desvinculadoEn),
		index('whatsapp_mensajes_seguimientos_mensaje_idx').on(t.mensajeId)
	]
);

export type WhatsAppMensajeSeguimiento = typeof whatsappMensajesSeguimientos.$inferSelect;
