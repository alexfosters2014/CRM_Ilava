import { json } from '@sveltejs/kit';
import { enviarCorreoTicket } from '#lib/server/repositorios/tickets.ts';
import { correoTicketSchema } from '#lib/server/validaciones/tickets.ts';
import {
	leerCuerpo,
	respuestaErrorTickets,
	respuestaValidacion
} from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/tickets/[id]/correo
 *
 * Envía con la cuenta SMTP configurada y guarda threadId/Message-ID. La
 * ingesta de respuestas de Gmail queda para la integración con su API; este
 * endpoint ya deja el hilo localizable.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Ticket inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = correoTicketSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const ticket = await enviarCorreoTicket(locals.usuario!, id, validacion.data);
		return json({ ok: true, ticket });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
