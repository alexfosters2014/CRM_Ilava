import { json } from '@sveltejs/kit';
import { listarNotificacionesGenerales } from '#lib/server/repositorios/notificaciones.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/notificaciones
 *
 * Lista general para la campana de la cabecera. El repositorio filtra por las
 * pantallas habilitadas del usuario: tickets, seguimientos o ambas.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await listarNotificacionesGenerales(locals.usuario!));
	} catch (error) {
		console.error('[notificaciones] error al listar:', error);
		return json({ error: 'No se pudieron cargar las notificaciones' }, { status: 500 });
	}
};
