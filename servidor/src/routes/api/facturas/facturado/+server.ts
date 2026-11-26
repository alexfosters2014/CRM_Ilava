import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { idsFacturasSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/facturas/facturado
 * Marca como FACTURADO las facturas exportadas en la planilla de
 * multifacturación. Solo aplica a las que están en BANDEJA.
 * Body: { ids: number[] }
 */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = idsFacturasSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json({ error: 'Datos inválidos' }, { status: 400 });
	}

	const marcadas = await facturasRepositorio.marcarFacturadas(validacion.data.ids);
	return json({ marcadas });
};
