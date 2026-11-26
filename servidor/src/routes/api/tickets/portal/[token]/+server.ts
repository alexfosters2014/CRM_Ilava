import { json } from '@sveltejs/kit';
import {
	agregarMensajePortal,
	listarMensajesPortal,
	validarEnlacePublico
} from '#lib/server/repositorios/tickets-portal.ts';
import { portalMensajeSchema } from '#lib/server/validaciones/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * API pública del portal de tickets.
 *
 * No usa sesión: la autorización es el token del enlace. Solo se exponen
 * mensajes visibles al cliente y solo se aceptan respuestas mientras el ticket
 * esté abierto.
 */

const CABECERAS = {
	'cache-control': 'no-store',
	'referrer-policy': 'no-referrer',
	'x-robots-tag': 'noindex'
};

const responder = (datos: unknown, status = 200) =>
	json(datos, { status, headers: CABECERAS });

const envios = new Map<string, number[]>();

function permitirEnvio(clave: string): boolean {
	const ahora = Date.now();
	const previos = (envios.get(clave) ?? []).filter((marca) => ahora - marca < 10 * 60_000);
	if (previos.length >= 20) {
		envios.set(clave, previos);
		return false;
	}
	previos.push(ahora);
	envios.set(clave, previos);
	return true;
}

export const GET: RequestHandler = async ({ params }) => {
	const enlace = await validarEnlacePublico(params.token);
	if (!enlace) {
		return responder({ error: 'ENLACE_INVALIDO' }, 404);
	}

	return responder({
		ticket: {
			codigo: enlace.codigo,
			titulo: enlace.titulo,
			estado: enlace.estado,
			abierto: enlace.abierto
		},
		identificado: Boolean(enlace.email),
		nombre: enlace.nombre,
		mensajes: enlace.abierto ? await listarMensajesPortal(enlace.ticketId) : []
	});
};

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const enlace = await validarEnlacePublico(params.token);
	if (!enlace) {
		return responder({ error: 'ENLACE_INVALIDO' }, 404);
	}
	if (!enlace.abierto) {
		return responder({ error: 'TICKET_CERRADO' }, 409);
	}

	let ip = 'desconocida';
	try {
		ip = getClientAddress();
	} catch {
		// En algunos adaptadores no hay IP disponible.
	}
	if (!permitirEnvio(`${params.token}:${ip}`)) {
		return responder({ error: 'DEMASIADOS_ENVIOS' }, 429);
	}

	const cuerpo = await request.json().catch(() => null);
	const validacion = portalMensajeSchema.safeParse(cuerpo);
	if (!validacion.success) {
		return responder({ error: 'DATOS_INVALIDOS' }, 400);
	}
	if (validacion.data.website) {
		// Honeypot: respondemos ok para no darle información al bot.
		return responder({ ok: true });
	}

	try {
		const mensaje = await agregarMensajePortal(enlace, {
			nombre: validacion.data.nombre,
			email: validacion.data.email,
			contenido: validacion.data.contenido
		});
		return responder({ ok: true, mensaje });
	} catch (error) {
		const codigo = error instanceof Error ? error.message : '';
		if (codigo === 'TICKET_CERRADO') {
			return responder({ error: 'TICKET_CERRADO' }, 409);
		}
		if (codigo === 'EMAIL_REQUERIDO') {
			return responder({ error: 'EMAIL_REQUERIDO' }, 400);
		}
		console.error('[portal] error al guardar la respuesta:', error);
		return responder({ error: 'NO_SE_PUDO_GUARDAR' }, 500);
	}
};
