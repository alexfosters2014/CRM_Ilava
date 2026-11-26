import { json } from '@sveltejs/kit';
import { esViolacionUnica } from '#lib/server/base-datos/index.ts';
import { configuracionRepositorio } from '#lib/server/repositorios/index.ts';
import { catalogoSchema, valorParcialSchema } from '#lib/server/validaciones/configuracion.ts';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/configuracion/catalogos/:catalogo/:id
 * Edita un valor y/o su switch de habilitado.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const catalogo = catalogoSchema.safeParse(params.catalogo);
	if (!catalogo.success) return json({ error: 'Catálogo desconocido' }, { status: 404 });

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'Valor inválido' }, { status: 400 });

	let cuerpo: unknown;

	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}

	const validacion = valorParcialSchema.safeParse(cuerpo);
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
		const actualizado = await configuracionRepositorio.actualizarValorCatalogo(
			catalogo.data,
			id,
			validacion.data
		);
		if (!actualizado) return json({ error: 'Valor no encontrado' }, { status: 404 });
		return json({ ok: true, id });
	} catch (error) {
		if (esViolacionUnica(error)) {
			return json({ error: 'Ya existe un valor con ese nombre o código' }, { status: 409 });
		}
		throw error;
	}
};
