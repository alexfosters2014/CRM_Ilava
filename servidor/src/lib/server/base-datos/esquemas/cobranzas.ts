import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	integer,
	jsonb,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';
import { servicios } from './servicios.ts';
import { cuentasCorreo, cuentasCorreoAlias, enviosCobranza } from './correo.ts';
import type { UsoEmail } from '../../servicios/emails.ts';

/**
 * Configuración global de cobranza (fila única id = 1).
 *
 * `copiaEmails` es una lista separada por comas. `copiaTipo` define si la copia
 * interna va visible (CC) u oculta (CCO). Aplica a envíos individuales y masivos.
 */
export const configuracionCobranza = pgTable('configuracion_cobranza', {
	id: integer('id').primaryKey().default(1),
	copiaActiva: boolean('copia_activa').notNull().default(false),
	copiaEmails: text('copia_emails'),
	copiaTipo: text('copia_tipo').notNull().default('CC'),
	// Plantilla que el detalle de cobranza propone para el envío individual.
	plantillaPredeterminadaId: integer('plantilla_predeterminada_id').references(
		() => plantillasCobranza.id,
		{ onDelete: 'set null' }
	),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
});

/** Período mensual importado para la cartera de cobranza. */
export const periodosCobranza = pgTable('periodos_cobranza', {
	id: serial('id').primaryKey(),
	periodo: text('periodo').notNull().unique(),
	cotizacionUsd: numeric('cotizacion_usd', { precision: 18, scale: 6 }).notNull(),
	archivoNombre: text('archivo_nombre'),
	archivoHash: text('archivo_hash'),
	creadoPor: text('creado_por'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
});

/** Comprobantes pendientes importados; separado de facturas del Multifacturador. */
export const comprobantesCobranza = pgTable(
	'comprobantes_cobranza',
	{
		id: serial('id').primaryKey(),
		periodoId: integer('periodo_id').notNull().references(() => periodosCobranza.id, { onDelete: 'cascade' }),
		servicioId: integer('servicio_id').notNull().references(() => servicios.id),
		claveOrigen: text('clave_origen').notNull(),
		tipoComprobante: text('tipo_comprobante').notNull().default(''),
		serie: text('serie').notNull(),
		numero: text('numero').notNull(),
		fechaEmision: date('fecha_emision').notNull(),
		fechaVencimiento: date('fecha_vencimiento'),
		moneda: text('moneda').notNull(),
		importe: numeric('importe', { precision: 18, scale: 2 }).notNull(),
		saldoPendiente: numeric('saldo_pendiente', { precision: 18, scale: 2 }).notNull(),
		activo: boolean('activo').notNull().default(true),
		// Exclusión temporal: queda fuera del próximo envío de estado de cuenta.
		// Se limpia automáticamente cuando ese envío se completa.
		excluidoEnvio: boolean('excluido_envio').notNull().default(false),
		excluidoEnvioEn: timestamp('excluido_envio_en', { withTimezone: true }),
		excluidoEnvioPor: text('excluido_envio_por'),
		eliminadoEn: timestamp('eliminado_en', { withTimezone: true }),
		eliminadoPor: text('eliminado_por'),
		eliminadoMotivo: text('eliminado_motivo'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [unique('comprobantes_cobranza_periodo_clave_uq').on(table.periodoId, table.claveOrigen)]
);

/**
 * Emails del servicio, con un único destino por fila.
 *
 * `uso` es el listado que recibe ese mail:
 * - COMPARTIDO: facturación y cobranza.
 * - FACTURACION: solo facturas.
 * - COBRANZA: solo estados de cuenta.
 *
 * No hay una copia por listado: los lectores filtran `uso`, así que agregar o
 * quitar un mail se refleja en ambos procesos sin sincronización posible.
 * El "modo" del servicio (compartido / separado / mixto) se deriva del conjunto.
 */
export const serviciosEmails = pgTable(
	'servicios_emails',
	{
		id: serial('id').primaryKey(),
		servicioId: integer('servicio_id').notNull().references(() => servicios.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		uso: text('uso').$type<UsoEmail>().notNull().default('COBRANZA'),
		activo: boolean('activo').notNull().default(true),
		// Baja lógica: el mail se conserva para el histórico y puede reactivarse.
		bajaEn: timestamp('baja_en', { withTimezone: true }),
		bajaPor: text('baja_por'),
		bajaMotivo: text('baja_motivo'),
		creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
		actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		unique('servicios_emails_servicio_email_uq').on(table.servicioId, table.email),
		check(
			'servicios_emails_uso_chk',
			sql`${table.uso} in ('COMPARTIDO', 'FACTURACION', 'COBRANZA')`
		)
	]
);

/** Lotes de importación de la planilla de mails de cobranza. */
export const importacionesEmails = pgTable('importaciones_emails', {
	id: serial('id').primaryKey(),
	archivo: text('archivo'),
	usuario: text('usuario'),
	totales: jsonb('totales').$type<Record<string, number>>(),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
});

/** Plantillas de comunicación; las variables se validan en el servicio. */
export const plantillasCobranza = pgTable('plantillas_cobranza', {
	id: serial('id').primaryKey(),
	nombre: text('nombre').notNull().unique(),
	asunto: text('asunto').notNull(),
	cuerpo: text('cuerpo').notNull(),
	cartaHabilitada: boolean('carta_habilitada').notNull().default(false),
	cartaHtml: text('carta_html'),
	// Imagen de fondo de la carta PDF, como data URL (JPEG/PNG comprimido).
	cartaFondo: text('carta_fondo'),
	activo: boolean('activo').notNull().default(true),
	creadoPor: text('creado_por'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
	actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
});

/** Auditoría de cambios operativos de comprobantes. */
export const auditoriaCobranza = pgTable('auditoria_cobranza', {
	id: serial('id').primaryKey(),
	comprobanteId: integer('comprobante_id').references(() => comprobantesCobranza.id, { onDelete: 'set null' }),
	servicioId: integer('servicio_id').notNull().references(() => servicios.id),
	accion: text('accion').notNull(),
	detalle: jsonb('detalle'),
	usuario: text('usuario'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
});

/** Observaciones que el usuario decidió ignorar en futuras importaciones. */
export const exclusionesCobranza = pgTable('exclusiones_cobranza', {
	id: serial('id').primaryKey(),
	clave: text('clave').notNull().unique(),
	contacto: text('contacto').notNull(),
	tipoComprobante: text('tipo_comprobante'),
	serie: text('serie'),
	numero: text('numero'),
	comprobante: text('comprobante'),
	fechaEmision: date('fecha_emision'),
	moneda: text('moneda'),
	importe: text('importe'),
	saldoPendiente: text('saldo_pendiente'),
	motivo: text('motivo').notNull(),
	activo: boolean('activo').notNull().default(true),
	creadoPor: text('creado_por'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow()
});

export type PeriodoCobranza = typeof periodosCobranza.$inferSelect;
export type ComprobanteCobranza = typeof comprobantesCobranza.$inferSelect;
export type EmailServicio = typeof serviciosEmails.$inferSelect;
export type ImportacionEmails = typeof importacionesEmails.$inferSelect;
export type PlantillaCobranza = typeof plantillasCobranza.$inferSelect;
export type ExclusionCobranza = typeof exclusionesCobranza.$inferSelect;
export type LoteEnvioCobranza = typeof lotesEnvioCobranza.$inferSelect;
export type LoteEnvioCobranzaItem = typeof lotesEnvioCobranzaItems.$inferSelect;

/**
 * Lote de envíos masivos de estado de cuenta.
 *
 * El procesamiento vive en el servidor (cola en segundo plano), no en el
 * navegador: si se cierra la pestaña, los envíos siguen. Al reiniciar el
 * servidor, los ítems que quedaron en PROCESANDO se reanudan.
 */
export const lotesEnvioCobranza = pgTable('lotes_envio_cobranza', {
	id: serial('id').primaryKey(),
	periodo: text('periodo').notNull(),
	plantillaId: integer('plantilla_id').references(() => plantillasCobranza.id, { onDelete: 'set null' }),
	cuentaId: integer('cuenta_id').references(() => cuentasCorreo.id, { onDelete: 'set null' }),
	aliasId: integer('alias_id').references(() => cuentasCorreoAlias.id, { onDelete: 'set null' }),
	usuario: text('usuario'),
	total: integer('total').notNull().default(0),
	estado: text('estado').notNull().default('PENDIENTE'),
	creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
	iniciadoEn: timestamp('iniciado_en', { withTimezone: true }),
	finalizadoEn: timestamp('finalizado_en', { withTimezone: true })
});

export const lotesEnvioCobranzaItems = pgTable(
	'lotes_envio_cobranza_items',
	{
		id: serial('id').primaryKey(),
		loteId: integer('lote_id')
			.notNull()
			.references(() => lotesEnvioCobranza.id, { onDelete: 'cascade' }),
		servicioId: integer('servicio_id').notNull().references(() => servicios.id),
		estado: text('estado').notNull().default('PENDIENTE'),
		error: text('error'),
		errorTipo: text('error_tipo'),
		intentos: integer('intentos').notNull().default(0),
		reanudado: boolean('reanudado').notNull().default(false),
		envioId: integer('envio_id').references(() => enviosCobranza.id, { onDelete: 'set null' }),
		actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
	},
	(tabla) => [unique('lotes_envio_cobranza_items_lote_servicio_uq').on(tabla.loteId, tabla.servicioId)]
);
