import { json } from '@sveltejs/kit';
import { plantillasRepositorio } from '#lib/server/repositorios/index.ts';
import { ErrorCatalogosFaltantes } from '#lib/server/servicios/importaciones.ts';
import { importacionSchema } from '#lib/server/validaciones/plantillas.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/plantillas/importar
 *
 * Recibe las filas ya leídas del Excel (el parseo binario lo hace el frontend
 * con SheetJS) y las persiste como plantillas + líneas.
 *
 * Reglas:
 * - Los catálogos no se auto-crean: un valor faltante rechaza el archivo (422)
 *   indicando cuál catálogo y qué valores faltan.
 * - Las filas cuyo servicio no existe (o está deshabilitado) no se importan y
 *   vuelven en `serviciosOmitidos` para mostrarlas en un modal.
 *
 * Body: { filas: FilaImportacion[] }
 */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = importacionSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return json(
			{
				error: 'El archivo tiene filas inválidas',
				detalles: validacion.error.issues.map((issue) => ({
					campo: issue.path.join('.'),
					mensaje: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	try {
		const resumen = await plantillasRepositorio.importarPlantillas(validacion.data.filas);
		return json(resumen, { status: 201 });
	} catch (error) {
		if (error instanceof ErrorCatalogosFaltantes) {
			return json(
				{
					error: 'Faltan valores de catálogo: agregalos antes de importar',
					faltantes: error.faltantes
				},
				{ status: 422 }
			);
		}
		throw error;
	}
};
