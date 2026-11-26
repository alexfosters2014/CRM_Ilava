import { boolean, integer, pgTable, primaryKey, serial, varchar } from 'drizzle-orm/pg-core';

/**
 * Catálogos importados desde Importaciones.xlsx.
 *
 * Todos tienen `activo`: un valor deshabilitado deja de ofrecerse en los chips
 * y la importación lo rechaza, pero los registros que ya lo usan se conservan.
 */
export const tiposComprobantes = pgTable('tipos_comprobantes', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 120 }).notNull().unique(),
	// Abreviatura para los chips de la tabla (máximo 8 caracteres).
	abreviatura: varchar('abreviatura', { length: 8 }),
	activo: boolean('activo').notNull().default(true)
});

export const tiposPrecios = pgTable('tipos_precios', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 80 }).notNull().unique(),
	activo: boolean('activo').notNull().default(true)
});

export const monedas = pgTable('monedas', {
	id: serial('id').primaryKey(),
	codigo: varchar('codigo', { length: 12 }).notNull().unique(),
	activo: boolean('activo').notNull().default(true)
});

export const articulos = pgTable('articulos', {
	id: serial('id').primaryKey(),
	codigo: varchar('codigo', { length: 30 }).notNull().unique(),
	descripcion: varchar('descripcion', { length: 180 }).notNull(),
	activo: boolean('activo').notNull().default(true)
});

export const tiposGestion = pgTable('tipos_gestion', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 60 }).notNull().unique(),
	activo: boolean('activo').notNull().default(true)
});

export const tiposCliente = pgTable('tipos_cliente', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 60 }).notNull().unique(),
	activo: boolean('activo').notNull().default(true)
});

export const modalidadesCobranza = pgTable('modalidades_cobranza', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 80 }).notNull().unique(),
	activo: boolean('activo').notNull().default(true)
});

/**
 * Cómo se gestiona la facturación del servicio (no confundir con
 * `tipos_gestion`, que es la gestión de cobranza del cliente).
 */
export const tiposGestionFacturacion = pgTable('tipos_gestion_facturacion', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 60 }).notNull().unique(),
	activo: boolean('activo').notNull().default(true)
});

export const gruposFacturacion = pgTable('grupos_facturacion', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 80 }).notNull().unique(),
	color: varchar('color', { length: 20 }).notNull().default('azul'),
	// Colores configurables de la cabecera del grupo en las tablas.
	colorFondo: varchar('color_fondo', { length: 7 }).notNull().default('#3346b8'),
	colorTexto: varchar('color_texto', { length: 7 }).notNull().default('#ffffff'),
	activo: boolean('activo').notNull().default(true)
});

/**
 * Grupos de cobranza.
 *
 * Independientes de `grupos_facturacion` a propósito: la cobranza se agrupa por
 * criterios dinámicos (cobrador, zona, campaña) que no coinciden con la emisión.
 * `orden` define el orden de los bloques en la pantalla de cobranza.
 */
export const gruposCobranza = pgTable('grupos_cobranza', {
	id: serial('id').primaryKey(),
	nombre: varchar('nombre', { length: 80 }).notNull().unique(),
	colorFondo: varchar('color_fondo', { length: 7 }).notNull().default('#3346b8'),
	colorTexto: varchar('color_texto', { length: 7 }).notNull().default('#ffffff'),
	orden: integer('orden').notNull().default(0),
	activo: boolean('activo').notNull().default(true)
});

/**
 * Pares moneda → tipo de precio válidos. Filtran el select de "Tipo de precio"
 * de los chips según la moneda elegida. Si una moneda no tiene pares cargados,
 * la interfaz muestra todos los tipos de precio.
 */
export const monedasTiposPrecio = pgTable(
	'monedas_tipos_precio',
	{
		monedaId: integer('moneda_id')
			.notNull()
			.references(() => monedas.id, { onDelete: 'cascade' }),
		tipoPrecioId: integer('tipo_precio_id')
			.notNull()
			.references(() => tiposPrecios.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.monedaId, t.tipoPrecioId] })]
);
