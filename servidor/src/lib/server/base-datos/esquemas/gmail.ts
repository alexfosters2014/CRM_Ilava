import {
	boolean,
	index,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from './auth.ts';
import { areas } from './areas.ts';

/**
 * Cuentas de Gmail Workspace conectadas por OAuth 2.0.
 *
 * Se separan de `cuentas_correo` (SMTP) a propósito:
 * - SMTP con app password sigue siendo el canal de los envíos masivos de
 *   cobranza.
 * - Gmail API se usa para seguimientos y tickets, donde hace falta `threadId`,
 *   `historyId` y lectura de respuestas.
 *
 * Los tokens NUNCA se guardan en claro: `refreshTokenCifrado` y
 * `accessTokenCifrado` usan AES-256-GCM con `CORREO_CLAVE`.
 *
 * `areaId` acota quién puede usar la casilla: ADMIN y el área TODOS ven todas;
 * el resto solo las de su área. Los correos de esa casilla no se muestran a
 * otras áreas.
 */
export const gmailCuentas = pgTable(
	'gmail_cuentas',
	{
		id: serial('id').primaryKey(),
		email: text('email').notNull(),
		nombre: text('nombre'),
		areaId: integer('area_id').references(() => areas.id, { onDelete: 'set null' }),
		refreshTokenCifrado: text('refresh_token_cifrado').notNull(),
		accessTokenCifrado: text('access_token_cifrado'),
		accessTokenExpiraEn: timestamp('access_token_expira_en', { withTimezone: true }),
		scope: text('scope'),
		historyId: text('history_id'),
		watchExpiraEn: timestamp('watch_expira_en', { withTimezone: true }),
		ultimaSincronizacion: timestamp('ultima_sincronizacion', { withTimezone: true }),
		ultimoError: text('ultimo_error'),
		activo: boolean('activo').notNull().default(true),
		creadoPor: text('creado_por').references(() => user.id, { onDelete: 'set null' }),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('gmail_cuentas_email_uq').on(t.email),
		index('gmail_cuentas_activo_idx').on(t.activo),
		index('gmail_cuentas_area_idx').on(t.areaId)
	]
);

export type GmailCuenta = typeof gmailCuentas.$inferSelect;
export type GmailCuentaNueva = typeof gmailCuentas.$inferInsert;
