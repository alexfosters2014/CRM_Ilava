import { boolean, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import {
	gruposCobranza,
	gruposFacturacion,
	modalidadesCobranza,
	tiposCliente,
	tiposGestion,
	tiposGestionFacturacion
} from './catalogos.ts';

/**
 * Tabla: servicios
 *
 * Un servicio es el cliente facturable: el "contacto" de la planilla mensual.
 * Se levanta desde su propio archivo de importación (pantalla Servicios).
 *
 * Atributos de gestión (tipo de gestión, tipo de cliente, modalidad de cobranza,
 * gestión de facturación), numeración (RUT/CI) y grupo viven acá. La moneda, el
 * tipo de comprobante, el tipo de precio y el ID de cliente son de la PLANTILLA.
 *
 * OJO: este archivo NO puede importar nada de SvelteKit ($app, #lib).
 */
export const TIPOS_NUMERACION = ['RUT', 'CEDULA', 'OTROS', 'SIN_NUMERACION'] as const;
export type TipoNumeracion = (typeof TIPOS_NUMERACION)[number];

export const servicios = pgTable('servicios', {
	id: serial('id').primaryKey(),
	contactoFacturacion: varchar('contacto_facturacion', { length: 180 }).notNull().unique(),
	nombreFantasia: varchar('nombre_fantasia', { length: 180 }),
	// RUT/CI como texto: los RUT uruguayos tienen 12 dígitos y no deben perder ceros.
	numeracion: varchar('numeracion', { length: 30 }),
	// Si no hay numeración, el tipo se fuerza a SIN_NUMERACION.
	tipoNumeracion: varchar('tipo_numeracion', { length: 20 }).notNull().default('SIN_NUMERACION'),
	grupoId: integer('grupo_id')
		.notNull()
		.references(() => gruposFacturacion.id),
	// Grupo de cobranza: opcional y distinto del de facturación.
	grupoCobranzaId: integer('grupo_cobranza_id').references(() => gruposCobranza.id, {
		onDelete: 'set null'
	}),
	tipoGestionId: integer('tipo_gestion_id')
		.notNull()
		.references(() => tiposGestion.id),
	tipoClienteId: integer('tipo_cliente_id')
		.notNull()
		.references(() => tiposCliente.id),
	modalidadCobranzaId: integer('modalidad_cobranza_id')
		.notNull()
		.references(() => modalidadesCobranza.id),
	tipoGestionFacturacionId: integer('tipo_gestion_facturacion_id')
		.notNull()
		.references(() => tiposGestionFacturacion.id),
	comentarioGestionFacturacion: text('comentario_gestion_facturacion'),
	// Celular para WhatsApp en formato E.164 sin '+' (ej.: 59899123456).
	// Solo móviles uruguayos: es la llave de la lista blanca de seguimientos.
	celular: varchar('celular', { length: 20 }),
	// Plazo de pago del servicio (días entre emisión y vencimiento). Se usa para
	// decidir si un comprobante está vencido al enviar "solo vencidos".
	cantidadDiasVencimiento: integer('cantidad_dias_vencimiento').notNull().default(30),
	habilitado: boolean('habilitado').notNull().default(true),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
	eliminadoEn: timestamp('eliminado_en', { withTimezone: true })
});

export type Servicio = typeof servicios.$inferSelect;
export type ServicioNuevo = typeof servicios.$inferInsert;
