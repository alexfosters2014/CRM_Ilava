import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { crearLineaFacturaSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/facturas/:id/lineas
 * Agrega una línea de facturación a la factura. La línea queda guardada y es
 * independiente de la plantilla de origen. El código se valida contra el
 * catálogo de artículos (400 si no existe).
 */
export const POST: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = crearLineaFacturaSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json(
			{
				error: 'Datos inválidos',
				detalles: validacion.error.issues.map((issue) => ({
					campo: issue.path.join('.'),
					mensaje: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	const facturaId = Number(params.id);
	if (!Number.isInteger(facturaId) || facturaId <= 0) {
		return json({ error: 'Factura inválida' }, { status: 400 });
	}

	try {
		const linea = await facturasRepositorio.agregarLinea(facturaId, validacion.data);
		return json(linea, { status: 201 });
	} catch (error) {
		if (error instanceof facturasRepositorio.ErrorArticuloInexistente) {
			return json({ error: error.message, codigo: error.codigo }, { status: 400 });
		}
		if (error instanceof facturasRepositorio.ErrorFactura) {
			return json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
};
