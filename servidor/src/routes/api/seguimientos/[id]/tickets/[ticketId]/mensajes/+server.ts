import { json } from '@sveltejs/kit';
import { agregarMensajeVinculado } from '#lib/server/repositorios/seguimientos.ts';
import { ErrorTickets } from '#lib/server/repositorios/tickets.ts';
import { mensajeTicketSchema } from '#lib/server/validaciones/tickets.ts';
import { respuestaErrorTickets } from '#lib/server/http/tickets.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/[id]/tickets/[ticketId]/mensajes
 *
 * Responde un ticket vinculado sin salir del Centro de seguimiento. La ruta
 * vive bajo /seguimientos a propósito: el guard pide la pantalla de
 * seguimientos y el repositorio de tickets aplica igual las reglas de
 * participación, ticket cerrado y menciones.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		const ticketId = Number(params.ticketId);
		if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(ticketId) || ticketId <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}

		const cuerpo = await leerCuerpo(request);
		const validacion = mensajeTicketSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const resultado = await agregarMensajeVinculado(
			locals.usuario!,
			id,
			ticketId,
			validacion.data
		);
		return json(resultado, { status: 201 });
	} catch (error) {
		if (error instanceof ErrorTickets) return respuestaErrorTickets(error);
		return respuestaErrorSeguimientos(error);
	}
};
