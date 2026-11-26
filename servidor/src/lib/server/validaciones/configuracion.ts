import { z } from 'zod';

/**
 * Capa: Validaciones — Configuración.
 *
 * Catálogos administrables (habilitar/deshabilitar, alta y edición), grupos con
 * sus colores y los colores globales de las filas alternadas.
 */

const colorHex = z
	.string()
	.trim()
	.regex(/^#[0-9a-fA-F]{6}$/, 'El color debe tener formato #RRGGBB');

/** Catálogos que se pueden administrar desde Configuración. */
export const CATALOGOS_ADMIN = [
	'tipos-comprobantes',
	'tipos-precios',
	'monedas',
	'tipos-gestion',
	'tipos-cliente',
	'modalidades-cobranza',
	'tipos-gestion-facturacion',
	'articulos'
] as const;

export type CatalogoAdmin = (typeof CATALOGOS_ADMIN)[number];

export const catalogoSchema = z.enum(CATALOGOS_ADMIN);

/** Alta de un valor de catálogo (los campos dependen del catálogo). */
export const nuevoValorSchema = z.object({
	nombre: z.string().trim().min(1).max(120).optional(),
	codigo: z.string().trim().min(1).max(30).optional(),
	descripcion: z.string().trim().min(1).max(180).optional(),
	abreviatura: z.string().trim().max(8).nullish(),
	monedaId: z.number().int().positive().nullish()
});

/** Edición de un valor de catálogo. */
export const valorParcialSchema = nuevoValorSchema.extend({
	activo: z.boolean().optional()
});

/** Alta/edición de grupo de facturación. */
export const grupoSchema = z.object({
	nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
	colorFondo: colorHex,
	colorTexto: colorHex
});

export const grupoParcialSchema = grupoSchema.partial().extend({
	activo: z.boolean().optional()
});

/** Colores globales de fila par/impar, líneas y espaciado de tablas/listas. */
export const aparienciaSchema = z.object({
	filaParFondo: colorHex,
	filaParTexto: colorHex,
	filaImparFondo: colorHex,
	filaImparTexto: colorHex,
	tablaLineaColor: colorHex,
	tablaLineaGrosor: z.number().int().min(0).max(4),
	filaPaddingY: z.number().int().min(0).max(24),
	listaLineaColor: colorHex,
	listaLineaGrosor: z.number().int().min(0).max(4)
});

export type Apariencia = z.infer<typeof aparienciaSchema>;

/**
 * Parámetros de facturación. Se pueden guardar por separado: Configuración
 * envía solo la serie y el Facturador solo el período y la fecha general.
 */
export const configuracionFacturacionSchema = z
	.object({
		serie: z
			.string()
			.trim()
			.min(1, 'La serie es obligatoria')
			.max(10, 'La serie admite hasta 10 caracteres')
			.optional(),
		periodo: z
			.string()
			.trim()
			.regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El período debe tener formato YYYY-MM')
			.nullish(),
		fechaGeneral: z
			.string()
			.trim()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
			.nullish()
	})
	.refine((datos) => Object.keys(datos).length > 0, 'No hay cambios para guardar');

export type ConfiguracionFacturacion = z.infer<typeof configuracionFacturacionSchema>;
