import { pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Tabla: variables
 *
 * Catálogo de variables de plantilla (ej. `mes-anio`). En la UI se muestran sin
 * llaves; en los textos viajan como `{{mes-anio}}`.
 *
 * `valor` guarda el ÚLTIMO valor usado (preferencia de trabajo): se carga en el
 * panel de variables del Facturador y se reutiliza en los próximos envíos. El
 * valor histórico no vive acá: al pasar a Bandeja queda sustituido dentro de
 * los textos de la factura.
 */
export const variables = pgTable('variables', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 60 }).notNull().unique(),
	valor: text('valor'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
});

export type Variable = typeof variables.$inferSelect;
export type VariableNueva = typeof variables.$inferInsert;
