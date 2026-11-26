import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { idsFacturasSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/facturas/devolver
 * Devuelve a la Bandeja → Facturador: BANDEJA pasa a PROCESO, se limpia el
 * motivo pendiente y el orden manual. Solo afecta a las que están en BANDEJA.
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

	const devueltas = await facturasRepositorio.devolverAFacturador(validacion.data.ids);
	return json({ devueltas });
};
