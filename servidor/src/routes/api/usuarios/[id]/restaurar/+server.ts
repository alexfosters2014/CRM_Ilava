import { json } from '@sveltejs/kit';
import {
	ErrorUsuarios,
	estadoHttpUsuarios,
	restaurarUsuario
} from '#lib/server/repositorios/usuarios.ts';
import type { RequestHandler } from './$types';

/** POST /api/usuarios/:id/restaurar — deshace la baja lógica. */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar usuarios' }, { status: 403 });
	}

	try {
		await restaurarUsuario(params.id);
		return json({ ok: true, id: params.id });
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
