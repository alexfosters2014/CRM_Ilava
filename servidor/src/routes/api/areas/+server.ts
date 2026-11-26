import { json } from '@sveltejs/kit';
import {
	ErrorUsuarios,
	crearArea,
	estadoHttpUsuarios,
	listarAreas
} from '#lib/server/repositorios/usuarios.ts';
import { areaSchema } from '#lib/server/validaciones/usuarios.ts';
import type { RequestHandler } from './$types';

/**
 * GET  /api/areas
 * POST /api/areas
 *
 * Solo ADMIN. Las áreas son organizativas: no otorgan permisos ni filtran datos.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar áreas' }, { status: 403 });
	}

	return json(await listarAreas());
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (locals.usuario?.rol !== 'ADMIN') {
		return json({ error: 'Solo un administrador puede administrar áreas' }, { status: 403 });
	}

	let cuerpo: unknown;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = areaSchema.safeParse(cuerpo);
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
		return json({ ok: true, ...(await crearArea(validacion.data.nombre)) }, { status: 201 });
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
