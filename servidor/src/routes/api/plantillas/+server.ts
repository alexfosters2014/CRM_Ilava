import { json } from '@sveltejs/kit';
import { plantillasRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/plantillas
 * Devuelve las plantillas agrupadas por grupo de facturación, con sus líneas.
 */
export const GET: RequestHandler = async () => {
	const grupos = await plantillasRepositorio.listarPlantillas();
	return json(grupos);
};
