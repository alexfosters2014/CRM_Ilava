import { json } from '@sveltejs/kit';
import { variablesRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * DELETE /api/variables/:id
 * Elimina el nombre de la variable. Los textos ya sustituidos no se tocan.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'Variable inválida' }, { status: 400 });
	}

	const eliminada = await variablesRepositorio.eliminarVariable(id);
	if (!eliminada) return json({ error: 'Variable no encontrada' }, { status: 404 });

	return json({ ok: true, eliminada: id });
};
