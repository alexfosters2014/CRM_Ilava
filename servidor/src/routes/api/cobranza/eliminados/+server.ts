import { json } from '@sveltejs/kit';
import { cobranzasRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/eliminados?periodo=YYYY-MM — comprobantes dados de baja. */
export const GET: RequestHandler = async ({ url }) => {
	const periodo = url.searchParams.get('periodo') ?? '';
	if (!/^\d{4}-\d{2}$/.test(periodo)) {
		return json({ error: 'Período inválido' }, { status: 400 });
	}
	return json(await cobranzasRepositorio.listarComprobantesEliminados(periodo));
};
