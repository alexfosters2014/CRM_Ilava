import {
	date,
	index,
	integer,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar
} from 'drizzle-orm/pg-core';
import {
	articulos,
	monedas,
	tiposComprobantes,
	tiposPrecios
} from './catalogos.ts';
import { servicios } from './servicios.ts';

/**
 * Tabla: plantillas
 *
 * Una plantilla es un conjunto de líneas que se factura mensualmente a un
 * servicio (el cliente facturable). Se identifica por servicio + número
 * agrupador; el grupo se deriva del servicio.
 *
 * La moneda, el tipo de comprobante, el tipo de precio y el ID de cliente son
 * atributos de la plantilla (vienen por fila en la planilla mensual y se editan
 * como chips en la tabla).
 *
 * Los campos auxiliares de EFactura (ID Compra, UTE fecha vencimiento, Detalle
 * e Información Adicional) son del DOCUMENTO, no de la línea: por eso viven acá
 * y se copian a la factura al enviarla al Facturador.
 *
 * OJO: este archivo NO puede importar nada de SvelteKit ($app, #lib).
 */
export const plantillas = pgTable(
	'plantillas',
	{
		id: serial('id').primaryKey(),
		servicioId: integer('servicio_id')
			.notNull()
			.references(() => servicios.id),
		agrupador: varchar('agrupador', { length: 40 }).notNull(),
		fecha: date('fecha'),
		serie: varchar('serie', { length: 20 }),
		monedaId: integer('moneda_id').references(() => monedas.id),
		tipoComprobanteId: integer('tipo_comprobante_id').references(() => tiposComprobantes.id),
		tipoPrecioId: integer('tipo_precio_id').references(() => tiposPrecios.id),
		idCliente: integer('id_cliente'),
		comentarioGeneral: text('comentario_general'),
		// --- Campos auxiliares de EFactura (del documento, no de la línea) ---
		idCompra: varchar('id_compra', { length: 80 }),
		detalleAuxiliar: text('detalle_auxiliar'),
		uteVencimiento: date('ute_vencimiento'),
		informacionAdicional: text('informacion_adicional'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
		// Borrado lógico: la plantilla deja de listarse pero la fila se conserva
		// (permite auditar y deshacer sin perder las líneas asociadas).
		eliminadoEn: timestamp('eliminado_en', { withTimezone: true })
	},
	(t) => [
		// Identidad de negocio: evita duplicar plantillas al reimportar el mismo archivo.
		uniqueIndex('plantillas_servicio_agrupador_uq').on(t.servicioId, t.agrupador)
	]
);

/** Línea de una plantilla: un artículo con cantidad e importe unitario. */
export const plantillasLineas = pgTable(
	'plantillas_lineas',
	{
		id: serial('id').primaryKey(),
		plantillaId: integer('plantilla_id')
			.notNull()
			.references(() => plantillas.id, { onDelete: 'cascade' }),
		articuloId: integer('articulo_id')
			.notNull()
			.references(() => articulos.id),
		cantidad: numeric('cantidad', { precision: 14, scale: 3 }).notNull().default('0'),
		importeUnitario: numeric('importe_unitario', { precision: 14, scale: 2 }).notNull().default('0'),
		comentario: text('comentario'),
		detalle: text('detalle'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('plantillas_lineas_plantilla_idx').on(t.plantillaId)]
);

export type Plantilla = typeof plantillas.$inferSelect;
export type PlantillaNueva = typeof plantillas.$inferInsert;
export type PlantillaLinea = typeof plantillasLineas.$inferSelect;
export type PlantillaLineaNueva = typeof plantillasLineas.$inferInsert;
