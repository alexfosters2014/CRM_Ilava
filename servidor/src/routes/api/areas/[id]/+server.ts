import { json } from '@sveltejs/kit';
import {
	ErrorUsuarios,
	actualizarArea,
	darDeBajaArea,
	estadoHttpUsuarios
} from '#lib/server/repositorios/usuarios.ts';
import { areaParcialSchema } from '#lib/server/validaciones/usuarios.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH  /api/areas/:id — renombrar o dar de baja (activo: false).
 * DELETE /api/areas/:id — baja lógica.
 *
 * El área TODOS está protegida y un área con usuarios activos no se puede dar
 * de baja: el repositorio lo rechaza con 409.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar áreas' }, { status: 403 });
	}

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'Área inválida' }, { status: 400 });
	}

	let cuerpo: unknown;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = areaParcialSchema.safeParse(cuerpo);
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
		await actualizarArea(id, validacion.data, locals.usuario.email);
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

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar áreas' }, { status: 403 });
	}

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'Área inválida' }, { status: 400 });
	}

	try {
		await darDeBajaArea(id, locals.usuario.email);
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
