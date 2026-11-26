import { json } from '@sveltejs/kit';
import { agregarParticipante } from '#lib/server/repositorios/tickets.ts';
import { participanteTicketSchema } from '#lib/server/validaciones/tickets.ts';
import {
	leerCuerpo,
	respuestaErrorTickets,
	respuestaValidacion
} from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/** POST /api/tickets/[id]/participantes */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Ticket inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = participanteTicketSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const ticket = await agregarParticipante(locals.usuario!, id, validacion.data);
		return json({ ok: true, ticket }, { status: 201 });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
