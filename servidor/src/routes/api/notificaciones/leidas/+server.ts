import { json } from '@sveltejs/kit';
import { marcarTodasLasNotificaciones } from '#lib/server/repositorios/notificaciones.ts';
import type { RequestHandler } from './$types';

/** POST /api/notificaciones/leidas — marca todas las de los módulos permitidos. */
export const POST: RequestHandler = async ({ locals }) => {
	try {
		const actualizadas = await marcarTodasLasNotificaciones(locals.usuario!);
		return json({ ok: true, actualizadas });
	} catch (error) {
		console.error('[notificaciones] error al marcar todas:', error);
		return json({ error: 'No se pudieron marcar las notificaciones' }, { status: 500 });
	}
};
