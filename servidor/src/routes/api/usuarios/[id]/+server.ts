import { json } from '@sveltejs/kit';
import {
	ErrorUsuarios,
	actualizarUsuario,
	darDeBajaUsuario,
	estadoHttpUsuarios
} from '#lib/server/repositorios/usuarios.ts';
import { usuarioParcialSchema } from '#lib/server/validaciones/usuarios.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH  /api/usuarios/:id  — nombre, correo, rol, área y pantallas.
 * DELETE /api/usuarios/:id  — baja lógica (?motivo=...) y borra sus sesiones.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar usuarios' }, { status: 403 });
	}

	let cuerpo: unknown;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = usuarioParcialSchema.safeParse(cuerpo);
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
		await actualizarUsuario(params.id, validacion.data, {
			id: locals.usuario.id,
			email: locals.usuario.email
		});
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

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar usuarios' }, { status: 403 });
	}

	try {
		await darDeBajaUsuario(
			params.id,
			{ id: locals.usuario.id, email: locals.usuario.email },
			url.searchParams.get('motivo') ?? undefined
		);
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
