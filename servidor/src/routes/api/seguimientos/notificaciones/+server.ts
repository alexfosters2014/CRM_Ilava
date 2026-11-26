import { json } from '@sveltejs/kit';
import { listarNotificacionesSeguimientos } from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** GET /api/seguimientos/notificaciones */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await listarNotificacionesSeguimientos(locals.usuario!));
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
