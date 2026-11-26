import { json } from '@sveltejs/kit';
import { buscarServiciosSeguimiento } from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** GET /api/seguimientos/servicios?q= — buscador del alta de seguimientos. */
export const GET: RequestHandler = async ({ url }) => {
	try {
		return json({ servicios: await buscarServiciosSeguimiento(url.searchParams.get('q') ?? '') });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
