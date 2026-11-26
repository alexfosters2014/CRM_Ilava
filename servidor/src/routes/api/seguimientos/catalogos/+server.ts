import { json } from '@sveltejs/kit';
import { listarCatalogosSeguimientos } from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** GET /api/seguimientos/catalogos — áreas, usuarios y permisos del módulo. */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await listarCatalogosSeguimientos(locals.usuario!));
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
