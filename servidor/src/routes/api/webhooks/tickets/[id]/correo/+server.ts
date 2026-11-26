import { json } from '@sveltejs/kit';
import { TICKETS_EMAIL_WEBHOOK_SECRET } from '$app/env/private';
import { registrarCorreoEntrante } from '#lib/server/repositorios/tickets.ts';
import { correoEntranteSchema } from '#lib/server/validaciones/tickets.ts';
import {
	leerCuerpo,
	respuestaErrorTickets,
	respuestaValidacion
} from '#lib/server/http/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/webhooks/tickets/[id]/correo
 *
 * Punto de entrada para el conector de correo (Gmail API o proveedor). Es
 * público a propósito porque lo llama un servicio externo, pero exige el
 * secreto compartido `x-ticket-secret`. Si el secreto no está configurado, el
 * endpoint queda deshabilitado (fail-closed).
 *
 * El mensaje se incorpora al historial con fecha y hora. Las menciones solo
 * otorgan acceso si el remitente es un usuario activo que ya participa del
 * ticket; un remitente externo no puede ampliar permisos por correo.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!TICKETS_EMAIL_WEBHOOK_SECRET) {
		return json({ error: 'Webhook de correo no configurado' }, { status: 404 });
	}
	if (request.headers.get('x-ticket-secret') !== TICKETS_EMAIL_WEBHOOK_SECRET) {
		return json({ error: 'No autorizado' }, { status: 401 });
	}

	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Ticket inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = correoEntranteSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const resultado = await registrarCorreoEntrante(id, validacion.data);
		return json({ ok: true, ...resultado }, { status: 201 });
	} catch (error) {
		return respuestaErrorTickets(error);
	}
};
