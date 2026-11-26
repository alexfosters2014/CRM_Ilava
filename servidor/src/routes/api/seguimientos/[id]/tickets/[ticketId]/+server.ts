import { json } from '@sveltejs/kit';
import { obtenerTicketVinculado } from '#lib/server/repositorios/seguimientos.ts';
import { ErrorTickets } from '#lib/server/repositorios/tickets.ts';
import { respuestaErrorTickets } from '#lib/server/http/tickets.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/seguimientos/[id]/tickets/[ticketId]
 *
 * Ficha y conversación del ticket vinculado. El detalle y los permisos los
 * aplica el repositorio de tickets: solo participantes y con la pantalla de
 * seguimientos habilitada.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const id = Number(params.id);
		const ticketId = Number(params.ticketId);
		if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(ticketId) || ticketId <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		return json(await obtenerTicketVinculado(locals.usuario!, id, ticketId));
	} catch (error) {
		if (error instanceof ErrorTickets) return respuestaErrorTickets(error);
		return respuestaErrorSeguimientos(error);
	}
};
