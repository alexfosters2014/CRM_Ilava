import { json } from '@sveltejs/kit';
import { listarNotificaciones } from '#lib/server/repositorios/tickets.ts';
import { respuestaErrorTickets } from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/** GET /api/tickets/notificaciones */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await listarNotificaciones(locals.usuario!));
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
