import { json } from '@sveltejs/kit';
import { buscarServiciosTickets } from '#lib/server/repositorios/tickets.ts';
import { busquedaTicketSchema } from '#lib/server/validaciones/tickets.ts';
import { respuestaErrorTickets, respuestaValidacion } from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/tickets/servicios?q=EMPRESA
 *
 * Búsqueda acotada para vincular un ticket a un servicio. Devuelve solo
 * servicios habilitados y los campos de referencia.
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const validacion = busquedaTicketSchema.safeParse({
			q: url.searchParams.get('q') ?? ''
		});
		if (!validacion.success) return respuestaValidacion(validacion.error);
		return json({ servicios: await buscarServiciosTickets(validacion.data.q) });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
