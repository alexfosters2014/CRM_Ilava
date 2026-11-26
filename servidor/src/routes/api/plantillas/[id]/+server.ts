import { json } from '@sveltejs/kit';
import { plantillasRepositorio } from '#lib/server/repositorios/index.ts';
import { actualizarPlantillaSchema } from '#lib/server/validaciones/plantillas.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/plantillas/:id
 * Edita los chips de la plantilla: moneda, tipo de comprobante, tipo de precio
 * e ID de cliente (por id de catálogo).
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = actualizarPlantillaSchema.safeParse(cuerpo);
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
		return json({ error: 'Plantilla inválida' }, { status: 400 });
	}

	const actualizada = await plantillasRepositorio.actualizarPlantilla(id, validacion.data);
	if (!actualizada) return json({ error: 'Plantilla no encontrada' }, { status: 404 });

	return json({ ok: true, id });
};
