import { json } from '@sveltejs/kit';
import { plantillasRepositorio } from '#lib/server/repositorios/index.ts';
import { actualizarLineaPlantillaSchema } from '#lib/server/validaciones/plantillas.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/plantillas/:id/lineas/:lineaId
 * Edición rápida de una línea: código, cantidad, importe unitario, detalle y
 * comentario. Un código inexistente no se guarda (400).
 *
 * DELETE /api/plantillas/:id/lineas/:lineaId
 * Baja DEFINITIVA de la línea. La plantilla no puede quedar sin líneas.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = actualizarLineaPlantillaSchema.safeParse(cuerpo);
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
	const lineaId = Number(params.lineaId);
	if (
		!Number.isInteger(plantillaId) ||
		plantillaId <= 0 ||
		!Number.isInteger(lineaId) ||
		lineaId <= 0
	) {
		return json({ error: 'Plantilla o línea inválida' }, { status: 400 });
	}

	try {
		const linea = await plantillasRepositorio.actualizarLineaPlantilla(
			plantillaId,
			lineaId,
			validacion.data
		);
		if (!linea) return json({ error: 'Línea no encontrada' }, { status: 404 });
		return json(linea);
	} catch (error) {
		if (error instanceof plantillasRepositorio.ErrorArticuloInexistente) {
			return json({ error: error.message, codigo: error.codigo }, { status: 400 });
		}
		throw error;
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const plantillaId = Number(params.id);
	const lineaId = Number(params.lineaId);
	if (
		!Number.isInteger(plantillaId) ||
		plantillaId <= 0 ||
		!Number.isInteger(lineaId) ||
		lineaId <= 0
	) {
		return json({ error: 'Plantilla o línea inválida' }, { status: 400 });
	}

	try {
		await plantillasRepositorio.eliminarLineaPlantilla(plantillaId, lineaId);
		return json({ ok: true });
	} catch (error) {
		if (error instanceof plantillasRepositorio.ErrorPlantilla) {
			return json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
};
