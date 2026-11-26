import { json } from '@sveltejs/kit';
import {
	ErrorUsuarios,
	crearUsuario,
	estadoHttpUsuarios,
	listarUsuarios
} from '#lib/server/repositorios/usuarios.ts';
import { usuarioSchema } from '#lib/server/validaciones/usuarios.ts';
import type { RequestHandler } from './$types';

/**
 * GET  /api/usuarios?incluirInactivos=1
 * POST /api/usuarios
 *
 * Solo ADMIN. La segunda capa es explícita acá (además del guard de permisos):
 * `configuracion.usuarios` es `soloAdmin`, pero un error de catálogo no debe
 * alcanzar para abrir el alta de usuarios.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar usuarios' }, { status: 403 });
	}

	const incluirInactivos = url.searchParams.get('incluirInactivos') === '1';
	return json(await listarUsuarios(incluirInactivos));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar usuarios' }, { status: 403 });
	}

	let cuerpo: unknown;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = usuarioSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json(
			{
				error: 'Datos inválidos',
				detalles: validacion.error.issues.map((issue) => ({
					campo: issue.path.join('.'),
					mensaje: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	try {
		const resultado = await crearUsuario(validacion.data, locals.usuario.email);
		return json({ ok: true, ...resultado }, { status: 201 });
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
