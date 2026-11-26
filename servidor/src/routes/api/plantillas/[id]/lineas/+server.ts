import { json } from '@sveltejs/kit';
import { plantillasRepositorio } from '#lib/server/repositorios/index.ts';
import { crearLineaPlantillaSchema } from '#lib/server/validaciones/plantillas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/plantillas/:id/lineas
 * Agrega una línea de facturación a la plantilla. El código se valida contra el
 * catálogo de artículos (400 si no existe).
 */
export const POST: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = crearLineaPlantillaSchema.safeParse(cuerpo);
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

	const plantillaId = Number(params.id);
	if (!Number.isInteger(plantillaId) || plantillaId <= 0) {
		return json({ error: 'Plantilla inválida' }, { status: 400 });
	}

	try {
		const linea = await plantillasRepositorio.agregarLineaPlantilla(plantillaId, validacion.data);
		return json(linea, { status: 201 });
	} catch (error) {
		if (error instanceof plantillasRepositorio.ErrorArticuloInexistente) {
			return json({ error: error.message, codigo: error.codigo }, { status: 400 });
		}
		if (error instanceof plantillasRepositorio.ErrorPlantilla) {
			return json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
};
