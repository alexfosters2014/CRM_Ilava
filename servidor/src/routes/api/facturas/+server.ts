import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { crearFacturasSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/facturas?estado=PROCESO|PENDIENTE|BANDEJA|FACTURADO|COBRADO
 * Lista las facturas vivas con sus líneas.
 *
 * POST /api/facturas
 * Copia las plantillas seleccionadas al Facturador para un período.
 * Body: { plantillaIds: number[], periodo: 'YYYY-MM' }
 */
export const GET: RequestHandler = async ({ url }) => {
	const estado = url.searchParams.get('estado')?.trim();
	const facturas = await facturasRepositorio.listarFacturas(estado ? [estado] : undefined);
	return json(facturas);
};

export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = crearFacturasSchema.safeParse(cuerpo);
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

	try {
		const resumen = await facturasRepositorio.crearDesdePlantillas(
			validacion.data.plantillaIds,
			validacion.data.periodo,
			validacion.data.fecha
		);
		return json(resumen, { status: 201 });
	} catch (error) {
		if (error instanceof facturasRepositorio.ErrorFactura) {
			return json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
};
