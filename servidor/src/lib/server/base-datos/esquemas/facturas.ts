import { sql } from 'drizzle-orm';
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar
} from 'drizzle-orm/pg-core';
import { articulos, gruposFacturacion } from './catalogos.ts';
import { plantillas } from './plantillas.ts';
import { servicios } from './servicios.ts';
import type { SnapshotVariables } from '../../servicios/variables.ts';

/**
 * Estados por los que pasa una factura del multifacturador.
 *
 * PROCESO → PENDIENTE → BANDEJA → FACTURADO → COBRADO, con ELIMINADO como
 * salida en cualquier punto. Cuando llega al Facturador ya es una copia: la
 * plantilla original no se toca.
 */
export const ESTADOS_FACTURA = [
	'PROCESO',
	'PENDIENTE',
	'BANDEJA',
	'FACTURADO',
	'COBRADO',
	'ELIMINADO'
] as const;

export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

/**
 * Tabla: facturas
 *
 * Copia de la plantilla al enviarla al Facturador. Guarda un snapshot del
 * servicio (contacto, RUT, nombre de fantasía y atributos de gestión) y de la
 * moneda: si mañana cambia el servicio, la factura no se mueve.
 *
 * `serie` y `numero` quedan vacíos: el facturador real es externo y todavía no
 * los provee.
 */
export const facturas = pgTable(
	'facturas',
	{
		id: serial('id').primaryKey(),
		grupoId: integer('grupo_id')
			.notNull()
			.references(() => gruposFacturacion.id),
		plantillaId: integer('plantilla_id')
			.notNull()
			.references(() => plantillas.id),
		periodo: varchar('periodo', { length: 7 }).notNull(),
		servicioId: integer('servicio_id').references(() => servicios.id),
		contactoFacturacion: varchar('contacto_facturacion', { length: 180 }).notNull(),
		nombreFantasia: varchar('nombre_fantasia', { length: 180 }),
		numeracion: varchar('numeracion', { length: 30 }),
		tipoNumeracion: varchar('tipo_numeracion', { length: 20 }).notNull().default('SIN_NUMERACION'),
		tipoGestion: varchar('tipo_gestion', { length: 60 }).notNull(),
		tipoCliente: varchar('tipo_cliente', { length: 60 }).notNull(),
		modalidadCobranza: varchar('modalidad_cobranza', { length: 80 }).notNull(),
		tipoGestionFacturacion: varchar('tipo_gestion_facturacion', { length: 60 }).notNull(),
		comentarioGestionFacturacion: text('comentario_gestion_facturacion'),
		moneda: varchar('moneda', { length: 3 }).notNull(),
		tipoComprobante: varchar('tipo_comprobante', { length: 120 }),
		tipoPrecio: varchar('tipo_precio', { length: 80 }),
		idCliente: integer('id_cliente'),
		fecha: date('fecha'),
		estado: varchar('estado', { length: 20 }).notNull().default('PROCESO'),
		motivoPendiente: text('motivo_pendiente'),
		// Cuándo y por qué vía salió a facturar: MULTIFACTURACION | API | MANUAL.
		facturadoEn: timestamp('facturado_en', { withTimezone: true }),
		facturadoPor: varchar('facturado_por', { length: 20 }),
		// Se marca al "Limpiar" el histórico: deja de mostrarse en el modal.
		facturadoVisto: boolean('facturado_visto').notNull().default(false),
		serie: varchar('serie', { length: 20 }),
		numero: varchar('numero', { length: 40 }),
		comentarioGeneral: text('comentario_general'),
		/** Orden manual SOLO para la Bandeja: null = sin prioridad (va al final,
		 * en el orden natural). Se numera a mano desde la tabla. */
		ordenManual: integer('orden_manual'),
		/**
		 * Textos originales + valores usados al pasar a BANDEJA. Permite que
		 * "Devolver a Facturador" restaure los `{{clave}}` exactos, sin adivinar
		 * buscando el valor sustituido dentro del texto.
		 */
		variablesSnapshot: jsonb('variables_snapshot').$type<SnapshotVariables>(),
		// --- Campos auxiliares de EFactura (del documento) ---
		idCompra: varchar('id_compra', { length: 80 }),
		detalleAuxiliar: text('detalle_auxiliar'),
		uteVencimiento: date('ute_vencimiento'),
		informacionAdicional: text('informacion_adicional'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
		eliminadoEn: timestamp('eliminado_en', { withTimezone: true })
	},
	(t) => [
		// Una plantilla no puede copiarse dos veces al mismo período mientras siga viva.
		uniqueIndex('facturas_plantilla_periodo_uq')
			.on(t.plantillaId, t.periodo)
			.where(sql`${t.eliminadoEn} is null`),
		index('facturas_estado_idx').on(t.estado)
	]
);

/** Línea de facturación: snapshot del artículo y los valores editables. */
export const facturaLineas = pgTable(
	'factura_lineas',
	{
		id: serial('id').primaryKey(),
		facturaId: integer('factura_id')
			.notNull()
			.references(() => facturas.id, { onDelete: 'cascade' }),
		articuloId: integer('articulo_id')
			.notNull()
			.references(() => articulos.id),
		codigo: varchar('codigo', { length: 30 }).notNull(),
		descripcion: varchar('descripcion', { length: 180 }).notNull(),
		cantidad: numeric('cantidad', { precision: 14, scale: 3 }).notNull().default('0'),
		importeUnitario: numeric('importe_unitario', { precision: 14, scale: 2 }).notNull().default('0'),
		detalle: text('detalle'),
		comentario: text('comentario'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('factura_lineas_factura_idx').on(t.facturaId)]
);

export type Factura = typeof facturas.$inferSelect;
export type FacturaNueva = typeof facturas.$inferInsert;
export type FacturaLinea = typeof facturaLineas.$inferSelect;
export type FacturaLineaNueva = typeof facturaLineas.$inferInsert;
