import { json } from '@sveltejs/kit';
import { catalogoPermisos } from '#lib/server/repositorios/usuarios.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/permisos/catalogo
 *
 * Pantallas y opciones otorgables, para la grilla de switches. Excluye las
 * `soloAdmin` (Usuarios), que no se pueden dar a un operador.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede ver el catálogo de permisos' }, { status: 403 });
	}

	return json({ pantallas: catalogoPermisos() });
};
