import { json } from '@sveltejs/kit';
import {
	ErrorTickets,
	actualizarTicket,
	obtenerTicket
} from '#lib/server/repositorios/tickets.ts';
import { actualizarTicketSchema } from '#lib/server/validaciones/tickets.ts';
import {
	leerCuerpo,
	respuestaErrorTickets,
	respuestaValidacion
} from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

function idDeParams(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		throw new ErrorTickets('DATOS_INVALIDOS', 'El identificador del ticket no es válido');
	}
	return id;
}

/** GET /api/tickets/[id] */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const ticket = await obtenerTicket(locals.usuario!, idDeParams(params));
		return json({ ticket });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};

/**
 * PATCH /api/tickets/[id]
 *
 * Incluye `version` para concurrencia optimista. Los cambios de estado,
 * prioridad, área, asignación, fecha límite y validación pasan por el mismo
 * endpoint, con reglas de negocio en el repositorio.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const cuerpo = await leerCuerpo(request);
		const validacion = actualizarTicketSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const ticket = await actualizarTicket(locals.usuario!, idDeParams(params), validacion.data);
		return json({ ok: true, ticket });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
