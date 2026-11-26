import { boolean, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Tabla: areas
 *
 * Agrupación organizativa de los usuarios del CRM. NO otorga permisos ni
 * filtra datos: un usuario con área "Cobranzas" ve exactamente lo mismo que
 * uno con área "TODOS" si tiene las mismas pantallas habilitadas.
 *
 * `protegida` marca las áreas del sistema (hoy solo "TODOS"): no se renombran
 * ni se dan de baja. La baja es lógica, igual que en comprobantes_cobranza.
 */
export const areas = pgTable('areas', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 80 }).notNull().unique(),
	protegida: boolean('protegida').notNull().default(false),
	activo: boolean('activo').notNull().default(true),
	eliminadoEn: timestamp('eliminado_en', { withTimezone: true }),
	eliminadoPor: text('eliminado_por'),
	eliminadoMotivo: text('eliminado_motivo'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
});

/** Área del sistema: la que recibe el primer administrador. */
export const AREA_TODOS = 'TODOS';

export type Area = typeof areas.$inferSelect;
