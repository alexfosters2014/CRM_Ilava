import { json } from '@sveltejs/kit';
import { facturasRepositorio } from '#lib/server/repositorios/index.ts';
import { eliminacionFacturasSchema } from '#lib/server/validaciones/facturas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/facturas/eliminar
 * Borrado lógico por lote: las facturas pasan a ELIMINADO.
 * Body: { ids: number[] }
 */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = eliminacionFacturasSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json({ error: 'Datos inválidos' }, { status: 400 });
	}

	const eliminadas = await facturasRepositorio.eliminarFacturas(validacion.data.ids);
	return json({ eliminadas });
};
