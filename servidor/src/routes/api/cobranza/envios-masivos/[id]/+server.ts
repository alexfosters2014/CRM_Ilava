import { json } from '@sveltejs/kit';
import { colaEnviosRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/envios-masivos/:id — lote con el detalle de cada mail. */
export const GET: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, { status: 400 });
	const resumen = await colaEnviosRepositorio.resumenLote(id);
	if (!resumen) return json({ error: 'Lote no encontrado' }, { status: 404 });
	return json({ ...resumen, items: await colaEnviosRepositorio.itemsLote(id) });
};
