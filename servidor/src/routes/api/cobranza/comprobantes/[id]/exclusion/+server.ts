import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/cobranza/comprobantes/:id/exclusion
 * Body: { excluido: boolean, usuario? }
 * Alterna la exclusión temporal (fuera del próximo envío de estado de cuenta).
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	try {
		const fila = await cobranzasRepositorio.alternarExclusionEnvio(id, Boolean(cuerpo?.excluido), await usuarioDePeticion(request, cuerpo?.usuario));
		return json(fila);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo actualizar' }, { status: 400 });
	}
};
