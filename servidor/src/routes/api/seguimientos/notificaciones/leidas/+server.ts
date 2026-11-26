import { json } from '@sveltejs/kit';
import { marcarNotificacionesLeidas } from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** POST /api/seguimientos/notificaciones/leidas */
export const POST: RequestHandler = async ({ locals }) => {
	try {
		const actualizadas = await marcarNotificacionesLeidas(locals.usuario!);
		return json({ ok: true, actualizadas });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
