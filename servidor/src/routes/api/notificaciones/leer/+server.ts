import { json } from '@sveltejs/kit';
import { marcarNotificacionLeida } from '#lib/server/repositorios/notificaciones.ts';
import { marcarNotificacionSchema } from '#lib/server/validaciones/notificaciones.ts';
import type { RequestHandler } from './$types';

/** POST /api/notificaciones/leer — marca un aviso puntual del usuario. */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const cuerpo = await request.json().catch(() => null);
		const validacion = marcarNotificacionSchema.safeParse(cuerpo);
		if (!validacion.success) {
			return json({ error: 'Datos inválidos', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const actualizada = await marcarNotificacionLeida(
			locals.usuario!,
			validacion.data.origen,
			validacion.data.id
		);
		return json({ ok: actualizada });
	} catch (error) {
		console.error('[notificaciones] error al marcar una:', error);
		return json({ error: 'No se pudo marcar la notificación' }, { status: 500 });
	}
};
