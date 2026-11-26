import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import { catalogoSchema, nuevoValorSchema } from '#lib/server/validaciones/configuracion.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/configuracion/catalogos/:catalogo
 * Alta de un valor. Los catálogos con código (monedas, artículos) lo exigen.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const catalogo = catalogoSchema.safeParse(params.catalogo);
	if (!catalogo.success) return json({ error: 'Catálogo desconocido' }, { status: 404 });

	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = nuevoValorSchema.safeParse(cuerpo);
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

	const datos = validacion.data;
	const usaCodigo = catalogo.data === 'monedas' || catalogo.data === 'articulos';
	if (usaCodigo && !datos.codigo && !datos.nombre) {
		return json({ error: 'El código es obligatorio' }, { status: 400 });
	}
	if (!usaCodigo && !datos.nombre) {
		return json({ error: 'El nombre es obligatorio' }, { status: 400 });
	}

	try {
		await configuracionRepositorio.crearValorCatalogo(catalogo.data, datos);
		return json({ ok: true }, { status: 201 });
	} catch (error) {
		if (esViolacionUnica(error)) {
			return json({ error: 'Ya existe un valor con ese nombre o código' }, { status: 409 });
		}
		throw error;
	}
};
