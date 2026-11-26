import { z } from 'zod';

/**
 * Capa: Validaciones — Facturador.
 *
 * La factura es una copia de la plantilla: acá se valida lo que el usuario
 * manda al crear la copia, editarla y moverla de estado.
 */

const periodo = z
	.string()
	.trim()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El período debe tener formato YYYY-MM');

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');

/** Moneda: únicos valores admitidos por la operativa. */
export const monedaSchema = z.enum(['$', 'USD']);

/** Estados a los que se puede mover una factura (ELIMINADO va por su endpoint). */
export const estadoDestinoSchema = z.enum([
	'PROCESO',
	'PENDIENTE',
	'BANDEJA',
	'FACTURADO',
	'COBRADO'
]);

/** Body de POST /api/facturas: copiar plantillas al Facturador. */
export const crearFacturasSchema = z.object({
	plantillaIds: z.array(z.number().int().positive()).min(1, 'Elegí al menos una plantilla').max(500),
	periodo,
	// Fecha global del lote: se carga antes de enviar y queda en cada factura.
	fecha: fechaIso
});

/** Body de PATCH /api/facturas/[id]: cabecera editable. */
export const actualizarFacturaSchema = z
	.object({
		comentarioGeneral: z.string().nullish(),
		moneda: monedaSchema.optional(),
		tipoComprobante: z.string().trim().max(120).nullish(),
		tipoPrecio: z.string().trim().max(80).nullish(),
		idCliente: z.number().int().positive().nullish(),
		fecha: fechaIso.nullish(),
		serie: z.string().trim().max(20).nullish(),
		numero: z.string().trim().max(40).nullish(),
		ordenManual: z.number().int().min(1).max(9999).nullish(),
		// Campos auxiliares de EFactura: son del documento, no de la línea.
		idCompra: z.string().trim().max(80).nullish(),
		detalleAuxiliar: z.string().nullish(),
		uteVencimiento: fechaIso.nullish(),
		informacionAdicional: z.string().nullish()
	})
	.refine((datos) => Object.keys(datos).length > 0, 'No hay cambios para aplicar');

/** Body de POST /api/facturas/[id]/lineas: alta de una línea de facturación. */
export const crearLineaFacturaSchema = z.object({
	codigo: z.string().trim().min(1, 'El código es obligatorio').max(30),
	cantidad: z.number().finite().min(0).default(1),
	importeUnitario: z.number().finite().min(0).default(0),
	detalle: z.string().nullish(),
	comentario: z.string().nullish()
});

/** Body de PATCH /api/facturas/[id]/lineas/[lineaId]. */
export const actualizarLineaSchema = z
	.object({
		codigo: z.string().trim().min(1, 'El código es obligatorio').max(30).optional(),
		cantidad: z.number().finite().min(0).optional(),
		importeUnitario: z.number().finite().min(0).optional(),
		detalle: z.string().nullish(),
		comentario: z.string().nullish()
	})
	.refine((datos) => Object.keys(datos).length > 0, 'No hay cambios para aplicar');

/** Body de POST /api/facturas/[id]/estado. */
export const cambioEstadoSchema = z.object({
	estado: estadoDestinoSchema,
	motivo: z.string().trim().max(2000).nullish(),
	fecha: fechaIso.nullish(),
	variables: z.record(z.string().trim().max(60), z.string().max(500)).optional()
});

/** Body de POST /api/facturas/eliminar (borrado lógico por lote). */
export const eliminacionFacturasSchema = z.object({
	ids: z.array(z.number().int().positive()).min(1).max(500)
});

/** Body de los lotes que solo necesitan ids (devolver, facturado). */
export const idsFacturasSchema = z.object({
	ids: z.array(z.number().int().positive()).min(1, 'Elegí al menos una factura').max(500)
});

/** Body de POST /api/variables. */
const nombreVariableSchema = z
	.string()
	.trim()
	.min(1, 'El nombre es obligatorio')
	.max(60)
	.regex(/^[\w-]+$/, 'El nombre solo admite letras, números, guion y guion bajo');

export const variableSchema = z.object({ nombre: nombreVariableSchema });

/** Body de PUT /api/variables: catálogo completo + último valor de cada una. */
export const variablesGuardarSchema = z.object({
	variables: z
		.array(
			z.object({
				nombre: nombreVariableSchema,
				valor: z.string().trim().max(500, 'El valor admite hasta 500 caracteres').nullish()
			})
		)
		.max(100, 'Como máximo 100 variables')
});

export type CrearFacturas = z.infer<typeof crearFacturasSchema>;
export type ActualizarFactura = z.infer<typeof actualizarFacturaSchema>;
export type ActualizarLinea = z.infer<typeof actualizarLineaSchema>;
export type CambioEstado = z.infer<typeof cambioEstadoSchema>;
