import { json } from '@sveltejs/kit';
import { marcarNotificacionesLeidas } from '#lib/server/repositorios/tickets.ts';
import { respuestaErrorTickets } from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/** POST /api/tickets/notificaciones/leidas */
export const POST: RequestHandler = async ({ locals }) => {
	try {
		const actualizadas = await marcarNotificacionesLeidas(locals.usuario!);
		return json({ ok: true, actualizadas });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
