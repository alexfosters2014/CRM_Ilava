import { json } from '@sveltejs/kit';
import { serviciosRepositorio } from '#lib/server/repositorios/index.ts';
import { importacionServiciosSchema } from '#lib/server/validaciones/servicios.ts';
import { ErrorCatalogosFaltantes, ErrorFilasInvalidas } from '#lib/server/servicios/importaciones.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/servicios
 * Lista los servicios con sus catálogos resueltos.
 *
 * POST /api/servicios/importar
 * Importa el archivo de servicios. Body: { filas: FilaServicio[] }
 * - Valida los catálogos existentes: los faltantes rechazan el archivo (422).
 * - No importa duplicados (dentro del archivo o en la base) y los informa.
 */
export const GET: RequestHandler = async () => {
	const servicios = await serviciosRepositorio.listarServicios();
	return json(servicios);
};

export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = importacionServiciosSchema.safeParse(cuerpo);
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
		const resumen = await serviciosRepositorio.importarServicios(validacion.data.filas);
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
		if (error instanceof ErrorFilasInvalidas) {
			return json(
				{
					error: error.message,
					detalles: error.detalles.map((detalle) => ({
						campo: `fila ${detalle.fila}`,
						mensaje: detalle.mensaje
					}))
				},
				{ status: 422 }
			);
		}
		throw error;
	}
};
