import { json } from '@sveltejs/kit';
import { serviciosRepositorio } from '#lib/server/repositorios/index.ts';
import { actualizarServicioSchema } from '#lib/server/validaciones/servicios.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/servicios/:id
 * Edita un servicio: switch de habilitado, numeración, grupo, gestión, etc.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = actualizarServicioSchema.safeParse(cuerpo);
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

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'Servicio inválido' }, { status: 400 });
	}

	const actualizado = await serviciosRepositorio.actualizarServicio(id, validacion.data);
	if (!actualizado) return json({ error: 'Servicio no encontrado' }, { status: 404 });

	return json({ ok: true, id });
};
