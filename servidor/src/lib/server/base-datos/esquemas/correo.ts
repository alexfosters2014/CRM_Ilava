import { sql } from 'drizzle-orm';
import { boolean, check, integer, jsonb, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { servicios } from './servicios.ts';

/**
 * Cuentas de correo para envíos de cobranza.
 *
 * La contraseña SMTP NO se guarda en claro: `claveCifrada` contiene el texto
 * cifrado con AES-256-GCM (ver `autenticacion/cifrado.ts`). La clave maestra
 * vive en la variable de entorno `CORREO_CLAVE`.
 */
export const cuentasCorreo = pgTable(
	'cuentas_correo',
	{
		id: serial('id').primaryKey(),
		nombre: text('nombre').notNull(),
		email: text('email').notNull(),
		host: text('host').notNull(),
		puerto: integer('puerto').notNull().default(587),
		seguro: boolean('seguro').notNull().default(false),
		usuario: text('usuario').notNull(),
		claveCifrada: text('clave_cifrada').notNull(),
		activo: boolean('activo').notNull().default(true),
		predeterminada: boolean('predeterminada').notNull().default(false),
		// Estado de la credencial SMTP, para detectar contraseñas cambiadas/revocadas.
		credencialEstado: text('credencial_estado').notNull().default('SIN_VERIFICAR'),
		credencialError: text('credencial_error'),
		credencialVerificadaEn: timestamp('credencial_verificada_en', { withTimezone: true }),
		creadoPor: text('creado_por'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(tabla) => [
		check(
			'cuentas_correo_credencial_estado_chk',
			sql`${tabla.credencialEstado} in ('SIN_VERIFICAR', 'OK', 'RECHAZADA')`
		)
	]
);

/** Alias verificados de una cuenta (p. ej. varias direcciones de un dominio propio). */
export const cuentasCorreoAlias = pgTable(
	'cuentas_correo_alias',
	{
		id: serial('id').primaryKey(),
		cuentaId: integer('cuenta_id')
			.notNull()
			.references(() => cuentasCorreo.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		nombreVisible: text('nombre_visible'),
		activo: boolean('activo').notNull().default(true),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(tabla) => [unique('cuentas_correo_alias_cuenta_email_uq').on(tabla.cuentaId, tabla.email)]
);

export const ESTADOS_ENVIO_COBRANZA = ['PENDIENTE', 'ENVIANDO', 'ENVIADO', 'ERROR'] as const;
export type EstadoEnvioCobranza = (typeof ESTADOS_ENVIO_COBRANZA)[number];

/**
 * Historial de envíos de estado de cuenta.
 *
 * Guarda un snapshot de lo enviado (destinatarios, totales y comprobantes
 * incluidos/excluidos) para poder auditar aunque luego cambien los saldos o se
 * eliminen comprobantes.
 */
export const enviosCobranza = pgTable('envios_cobranza', {
	id: serial('id').primaryKey(),
	servicioId: integer('servicio_id').notNull().references(() => servicios.id),
	periodo: text('periodo').notNull(),
	cuentaId: integer('cuenta_id').references(() => cuentasCorreo.id, { onDelete: 'set null' }),
	aliasId: integer('alias_id').references(() => cuentasCorreoAlias.id, { onDelete: 'set null' }),
	plantillaId: integer('plantilla_id'),
	usuario: text('usuario'),
	destinatarios: jsonb('destinatarios').notNull(),
	asunto: text('asunto').notNull(),
	estado: text('estado').notNull().default('PENDIENTE'),
	error: text('error'),
	errorTipo: text('error_tipo'),
	messageId: text('message_id'),
	totales: jsonb('totales'),
	comprobantes: jsonb('comprobantes'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
	enviadoEn: timestamp('enviado_en', { withTimezone: true })
});

export type CuentaCorreo = typeof cuentasCorreo.$inferSelect;
export type CuentaCorreoAlias = typeof cuentasCorreoAlias.$inferSelect;
export type EnvioCobranza = typeof enviosCobranza.$inferSelect;
