import { json } from '@sveltejs/kit';
import { plantillasRepositorio } from '#lib/server/repositorios/index.ts';
import { eliminacionSchema } from '#lib/server/validaciones/plantillas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/plantillas/eliminar
 *
 * Borrado lógico por lote: marca `eliminado_en` en las plantillas indicadas.
 * No se borran filas ni líneas (auditoría y posible restauración).
 *
 * Body: { ids: number[] }
 */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = eliminacionSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json(
			{
				error: 'Selección inválida',
				detalles: validacion.error.issues.map((issue) => ({
					campo: issue.path.join('.'),
					mensaje: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	const eliminadas = await plantillasRepositorio.eliminarPlantillas(validacion.data.ids);
	return json({ eliminadas }, { status: 200 });
};
