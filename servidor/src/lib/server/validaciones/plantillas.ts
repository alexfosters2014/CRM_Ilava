import { z } from 'zod';

/**
 * Capa: Validaciones — importación de plantillas.
 *
 * El archivo de plantillas trae: contacto, fecha, serie, número, moneda, tipo
 * de comprobante, tipo de precio, artículo, cantidades, comentarios e ID de
 * cliente. Los atributos del servicio (gestión, grupo) ya NO vienen acá: viven
 * en el archivo de servicios.
 */

const fechaIso = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');

/** Una fila del Excel de multifacturación mensual. */
export const filaImportacionSchema = z.object({
	contacto: z.string().trim().min(1, 'El contacto es obligatorio'),
	agrupador: z.string().trim().min(1, 'El número agrupador es obligatorio'),
	fecha: fechaIso.nullish(),
	serie: z.string().trim().nullish(),
	moneda: z.string().trim().nullish(),
	tipoComprobante: z.string().trim().nullish(),
	tipoPrecio: z.string().trim().nullish(),
	articuloCodigo: z.string().trim().min(1, 'El código de artículo es obligatorio'),
	cantidad: z.number().finite().nullish(),
	importeUnitario: z.number().finite().nullish(),
	comentario: z.string().nullish(),
	detalle: z.string().nullish(),
	informacionAdicional: z.string().nullish(),
	idCompra: z.string().trim().nullish(),
	vencimiento: fechaIso.nullish(),
	idCliente: z.string().trim().regex(/^\d*$/, 'El ID de cliente debe ser numérico').nullish()
});

/** Body completo de POST /api/plantillas/importar. */
export const importacionSchema = z.object({
	filas: z.array(filaImportacionSchema).min(1, 'El archivo no contiene filas para importar')
});

export type FilaImportacion = z.infer<typeof filaImportacionSchema>;

/** Body de PATCH /api/plantillas/[id]: los chips editables y el comentario general. */
export const actualizarPlantillaSchema = z
	.object({
		monedaId: z.number().int().positive().nullish(),
		tipoComprobanteId: z.number().int().positive().nullish(),
		tipoPrecioId: z.number().int().positive().nullish(),
		idCliente: z.number().int().positive().nullish(),
		comentarioGeneral: z.string().nullish(),
		fecha: fechaIso.nullish(),
		serie: z.string().trim().max(20).nullish(),
		// Campos auxiliares de EFactura: son del documento, no de la línea.
		idCompra: z.string().trim().max(80).nullish(),
		detalleAuxiliar: z.string().nullish(),
		uteVencimiento: fechaIso.nullish(),
		informacionAdicional: z.string().nullish()
	})
	.refine((datos) => Object.keys(datos).length > 0, 'No hay cambios para aplicar');

/** Body de POST /api/plantillas/[id]/lineas: alta de una línea de facturación. */
export const crearLineaPlantillaSchema = z.object({
	codigo: z.string().trim().min(1, 'El código es obligatorio').max(30),
	cantidad: z.number().finite().min(0).default(1),
	importeUnitario: z.number().finite().min(0).default(0),
	detalle: z.string().nullish(),
	comentario: z.string().nullish()
});

/** Body de PATCH /api/plantillas/[id]/lineas/[lineaId]: edición rápida de la línea. */
export const actualizarLineaPlantillaSchema = z
	.object({
		codigo: z.string().trim().min(1, 'El código es obligatorio').max(30).optional(),
		cantidad: z.number().finite().min(0).optional(),
		importeUnitario: z.number().finite().min(0).optional(),
		detalle: z.string().nullish(),
		comentario: z.string().nullish()
	})
	.refine((datos) => Object.keys(datos).length > 0, 'No hay cambios para aplicar');

/** Body de POST /api/plantillas/eliminar (borrado lógico por lote). */
export const eliminacionSchema = z.object({
	ids: z.array(z.number().int().positive()).min(1, 'Elegí al menos una plantilla').max(500)
});
