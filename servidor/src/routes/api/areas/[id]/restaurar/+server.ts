import { json } from '@sveltejs/kit';
import {
	ErrorUsuarios,
	estadoHttpUsuarios,
	restaurarArea
} from '#lib/server/repositorios/usuarios.ts';
import type { RequestHandler } from './$types';

/** POST /api/areas/:id/restaurar — deshace la baja lógica del área. */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar áreas' }, { status: 403 });
	}

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'Área inválida' }, { status: 400 });
	}

	try {
		await restaurarArea(id);
		return json({ ok: true, id });
	} catch (error) {
		if (error instanceof ErrorUsuarios) {
			return json(
				{ error: error.message, codigo: error.codigo },
				{ status: estadoHttpUsuarios(error.codigo) }
			);
		}
		throw error;
	}
};
