import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import { grupoParcialSchema } from '#lib/server/validaciones/configuracion.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/configuracion/grupos/:id
 * Edita nombre, colores y switch de habilitado del grupo.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = grupoParcialSchema.safeParse(cuerpo);
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
		return json({ error: 'Grupo inválido' }, { status: 400 });
	}

	try {
		const actualizado = await configuracionRepositorio.actualizarGrupo(id, validacion.data);
		if (!actualizado) return json({ error: 'Grupo no encontrado' }, { status: 404 });
		return json({ ok: true, id });
	} catch (error) {
		if (esViolacionUnica(error)) {
			return json({ error: 'Ya existe un grupo con ese nombre' }, { status: 409 });
		}
		throw error;
	}
};
