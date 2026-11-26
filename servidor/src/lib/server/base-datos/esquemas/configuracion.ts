import { date, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Tabla: configuracion_visual
 *
 * Ajustes globales de las tablas y listas: colores de fila par/impar, color y
 * grosor de la línea separadora, espaciado vertical de las filas y línea de
 * los ítems de lista. Es una única fila (id = 1) que se aplica a todos los
 * usuarios y se inyecta como variables CSS desde el layout raíz.
 */
export const configuracionVisual = pgTable('configuracion_visual', {
	id: integer('id').primaryKey().default(1),
	filaParFondo: varchar('fila_par_fondo', { length: 7 }).notNull().default('#e2e9f7'),
	filaParTexto: varchar('fila_par_texto', { length: 7 }).notNull().default('#111827'),
	filaImparFondo: varchar('fila_impar_fondo', { length: 7 }).notNull().default('#ffffff'),
	filaImparTexto: varchar('fila_impar_texto', { length: 7 }).notNull().default('#111827'),
	tablaLineaColor: varchar('tabla_linea_color', { length: 7 }).notNull().default('#e3e8f4'),
	tablaLineaGrosor: integer('tabla_linea_grosor').notNull().default(1),
	filaPaddingY: integer('fila_padding_y').notNull().default(2),
	listaLineaColor: varchar('lista_linea_color', { length: 7 }).notNull().default('#e3e8f4'),
	listaLineaGrosor: integer('lista_linea_grosor').notNull().default(1),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
});

export type ConfiguracionVisual = typeof configuracionVisual.$inferSelect;

/**
 * Tabla: configuracion_facturacion
 *
 * Parámetros de la facturación que no son de un documento puntual: la serie
 * que se imprime en la planilla de multifacturación, el período en proceso
 * (`YYYY-MM`) y la fecha general que se aplica a las facturas del envío. Única
 * fila (id = 1), igual que la configuración visual.
 */
export const configuracionFacturacion = pgTable('configuracion_facturacion', {
	id: integer('id').primaryKey().default(1),
	serie: varchar('serie', { length: 10 }).notNull().default('A'),
	periodo: varchar('periodo', { length: 7 }),
	fechaGeneral: date('fecha_general'),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
});

export type ConfiguracionFacturacion = typeof configuracionFacturacion.$inferSelect;
