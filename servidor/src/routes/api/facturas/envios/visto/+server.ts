import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { idsFacturasSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/facturas/envios/visto
 * Marca como vistos los envíos a facturar: dejan de mostrarse en el modal
 * "Enviados a facturar". No borra datos.
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

	const vistas = await facturasRepositorio.marcarEnviosVistos(validacion.data.ids);
	return json({ vistas });
};
