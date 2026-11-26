import { json } from '@sveltejs/kit';
import { crearTicket, listarTickets } from '#lib/server/repositorios/tickets.ts';
import { crearTicketSchema } from '#lib/server/validaciones/tickets.ts';
import {
	leerCuerpo,
	respuestaErrorTickets,
	respuestaValidacion
} from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * GET  /api/tickets
 * POST /api/tickets
 *
 * El guard de hooks.server.ts exige sesión y la pantalla `tickets`. El
 * repositorio aplica además la visibilidad por participación: un usuario con
 * acceso a Tickets no ve tickets ajenos.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json({ tickets: await listarTickets(locals.usuario!) });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const cuerpo = await leerCuerpo(request);
		const validacion = crearTicketSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const ticket = await crearTicket(locals.usuario!, validacion.data);
		return json({ ok: true, ticket }, { status: 201 });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
