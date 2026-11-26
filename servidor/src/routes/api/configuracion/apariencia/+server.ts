import { json } from '@sveltejs/kit';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import { aparienciaSchema } from '#lib/server/validaciones/configuracion.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/configuracion/apariencia
 * PUT /api/configuracion/apariencia
 *
 * Apariencia global: colores de fila par/impar, línea y espaciado de las
 * tablas y línea de los ítems de lista. Se aplica a todos los usuarios desde
 * el layout raíz.
 */
export const GET: RequestHandler = async () => {
	const apariencia = await configuracionRepositorio.obtenerApariencia();
	return json(apariencia);
};

export const PUT: RequestHandler = async ({ request }) => {
	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = aparienciaSchema.safeParse(cuerpo);
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

	await configuracionRepositorio.actualizarApariencia(validacion.data);
	return json({ ok: true, ...validacion.data });
};
