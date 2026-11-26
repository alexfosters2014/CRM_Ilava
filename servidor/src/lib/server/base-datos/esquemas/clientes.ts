import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

/**
 * Tabla: clientes
 *
 * Esquema Drizzle (fuente de tipos de la capa Repositorios y de las
 * migraciones en `drizzle/`). Drizzle es la única fuente de verdad del esquema
 * (se eliminó el antiguo `sql/init.sql`).
 *
 * OJO: este archivo NO puede importar nada de SvelteKit ($app, #lib, ...).
 * `drizzle-kit` lo carga fuera de Vite para generar migraciones y no resuelve
 * esos aliases. Solo imports de drizzle-orm y relativos.
 */
export const clientes = pgTable('clientes', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 120 }).notNull(),
	email: varchar('email', { length: 160 }).notNull().unique(),
	telefono: varchar('telefono', { length: 30 }),
	creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
});

/** Tipo de fila tal como se recibe desde PostgreSQL. */
export type Cliente = typeof clientes.$inferSelect;

/** Tipo de inserción: omite `id` (serial) y `creado_en` (default now()). */
export type ClienteNuevo = typeof clientes.$inferInsert;
