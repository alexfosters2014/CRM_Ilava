import { json } from '@sveltejs/kit';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import { configuracionFacturacionSchema } from '#lib/server/validaciones/configuracion.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/configuracion/facturacion
 * PUT /api/configuracion/facturacion
 *
 * Parámetros de facturación globales: serie de la planilla, período en proceso
 * (`YYYY-MM`) y fecha general de facturación (`YYYY-MM-DD`). El PUT acepta los
 * campos por separado.
 */
export const GET: RequestHandler = async () => {
	const facturacion = await configuracionRepositorio.obtenerConfiguracionFacturacion();
	return json(facturacion);
};

export const PUT: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = configuracionFacturacionSchema.safeParse(cuerpo);
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

	await configuracionRepositorio.actualizarConfiguracionFacturacion(validacion.data);
	const facturacion = await configuracionRepositorio.obtenerConfiguracionFacturacion();
	return json(facturacion);
};
