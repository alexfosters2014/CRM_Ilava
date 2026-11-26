import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/cobranza/grupos-cobranza
 * Body: { servicioIds: number[], grupoCobranzaId: number | null }
 * Asignación masiva del grupo de cobranza (null = sin grupo).
 */
export const POST: RequestHandler = async ({ request }) => {
	const cuerpo = await request.json().catch(() => null);
	const servicioIds = Array.isArray(cuerpo?.servicioIds)
		? cuerpo.servicioIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
		: [];
	if (servicioIds.length === 0) return json({ error: 'No hay servicios seleccionados' }, { status: 400 });
	const grupoCobranzaId =
		cuerpo?.grupoCobranzaId === null || cuerpo?.grupoCobranzaId === undefined
			? null
			: Number(cuerpo.grupoCobranzaId);
	const actualizados = await cobranzasRepositorio.asignarGrupoCobranza(servicioIds, grupoCobranzaId);
	return json({ actualizados });
};
