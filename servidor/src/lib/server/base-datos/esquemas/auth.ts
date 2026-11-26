import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { areas } from './areas.ts';

/**
 * Esquema core de Better Auth (tablas user, session, account, verification).
 *
 * Drizzle es la única fuente de verdad del esquema: estas tablas se definien
 * acá y se migran con `drizzle/` igual que el resto. Better Auth las consume vía
 * `drizzleAdapter(db, { provider: 'pg', schema })`.
 *
 * OJO: igual que `clientes.ts`, este archivo NO importa nada de SvelteKit
 * ($app, #lib). `drizzle-kit` lo carga fuera de Vite.
 *
 * Nota: Better Auth genera los `id` (UUID) en JavaScript y los inserta él
 * mismo. Por eso el id es `text('id').primaryKey()` SIN default de BD, que es
 * exactamente lo que emite el generador de esquema Drizzle de Better Auth para
 * PostgreSQL con la generación de id por defecto. No agregar `defaultRandom()`
 * (ni siquiera existe sobre columnas `text` en Drizzle).
 */

/** Roles del CRM. ADMIN tiene acceso total y administra usuarios y áreas. */
export const ROLES = ['ADMIN', 'OPERADOR'] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Usuario que inicia sesión en el CRM (NO es lo mismo que un `cliente` del CRM).
 *
 * Campos propios (no de Better Auth):
 * - `rol`: ADMIN u OPERADOR. Solo ADMIN administra usuarios, áreas y permisos.
 * - `activo` + `eliminadoEn`: baja lógica. Un usuario inactivo no crea sesión
 *   nueva y las existentes se borran al darlo de baja.
 * - `areaId`: agrupación organizativa. No filtra datos ni otorga permisos.
 *
 * Better Auth crea el usuario con los defaults, así que un alta por OTP deja
 * OPERADOR/activo, y el bootstrap lo promueve a ADMIN en el hook `after`.
 */
export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	rol: text('rol').notNull().default('OPERADOR'),
	activo: boolean('activo').notNull().default(true),
	areaId: integer('area_id').references(() => areas.id),
	eliminadoEn: timestamp('eliminado_en', { withTimezone: true }),
	eliminadoPor: text('eliminado_por'),
	eliminadoMotivo: text('eliminado_motivo'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/** Sesión activa de un usuario. */
export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

/** Método de autenticación vinculado a un usuario (p. ej. email-otp). */
export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Registros de verificación. Aquí se guardan los OTP de Email OTP (identifier =
 * email, value = el código), además de otros tokens de verificación.
 */
export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
