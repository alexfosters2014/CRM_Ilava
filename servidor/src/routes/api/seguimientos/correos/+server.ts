import { json } from '@sveltejs/kit';
import { listarCorreosSinVincular } from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/seguimientos/correos — bandeja de correos sin vincular.
 *
 * Se filtran por área: solo las casillas Gmail de la propia área (ADMIN y
 * TODOS ven todas). Los correos registrados sin casilla se ven siempre.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json({ correos: await listarCorreosSinVincular(locals.usuario!) });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
