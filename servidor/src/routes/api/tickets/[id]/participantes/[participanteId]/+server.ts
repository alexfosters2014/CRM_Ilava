import { json } from '@sveltejs/kit';
import { quitarParticipante } from '#lib/server/repositorios/tickets.ts';
import { respuestaErrorTickets } from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/** DELETE /api/tickets/[id]/participantes/[participanteId] */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const id = Number(params.id);
		const participanteId = Number(params.participanteId);
		if (
			!Number.isInteger(id) ||
			id <= 0 ||
			!Number.isInteger(participanteId) ||
			participanteId <= 0
		) {
			return json({ error: 'Participante inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const ticket = await quitarParticipante(locals.usuario!, id, participanteId);
		return json({ ok: true, ticket });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
