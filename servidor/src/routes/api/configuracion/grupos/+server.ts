import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import { grupoSchema } from '#lib/server/validaciones/configuracion.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/configuracion/grupos
 * POST /api/configuracion/grupos (nombre + colores)
 */
export const GET: RequestHandler = async () => {
	const grupos = await configuracionRepositorio.listarGruposAdmin();
	return json(grupos);
};

export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = grupoSchema.safeParse(cuerpo);
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
		await configuracionRepositorio.crearGrupo(validacion.data);
		return json({ ok: true }, { status: 201 });
	} catch (error) {
		if (esViolacionUnica(error)) {
			return json({ error: 'Ya existe un grupo con ese nombre' }, { status: 409 });
		}
		throw error;
	}
};
