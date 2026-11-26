import { json } from '@sveltejs/kit';
import { enviarCorreoSeguimiento } from '#lib/server/repositorios/gmail.ts';
import { obtenerSeguimiento } from '#lib/server/repositorios/seguimientos.ts';
import { enviarCorreoSeguimientoSchema } from '#lib/server/validaciones/gmail.ts';
import {
	leerCuerpo,
	respuestaErrorGmail,
	respuestaValidacion
} from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/[id]/correo
 *
 * Envía de verdad por Gmail API, con `[SEG-...]` en el asunto, Reply-To con
 * plus-addressing y `threadId` para conservar el hilo. Guarda Message-ID y
 * threadId en el historial.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = enviarCorreoSeguimientoSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const envio = await enviarCorreoSeguimiento(locals.usuario!, id, validacion.data);
		const seguimiento = await obtenerSeguimiento(locals.usuario!, id, false);
		return json({ ok: true, ...envio, seguimiento }, { status: 201 });
	} catch (error) {
		return respuestaErrorGmail(error);
	}
};
