import { json } from '@sveltejs/kit';
import { listarCatalogosTickets } from '#lib/server/repositorios/tickets.ts';
import { respuestaErrorTickets } from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/tickets/catalogos
 *
 * Áreas, usuarios activos y categorías para el alta y los filtros. No expone
 * datos sensibles: solo lo necesario para asignar y mencionar.
 */
export const GET: RequestHandler = async () => {
	try {
		return json(await listarCatalogosTickets());
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
