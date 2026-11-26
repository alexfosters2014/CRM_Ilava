import { json } from '@sveltejs/kit';
import { listarCuentasGmailParaEnvio } from '#lib/server/repositorios/gmail.ts';
import { respuestaErrorGmail } from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/** GET /api/tickets/cuentas-gmail — casillas del área disponibles para enviar. */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json({ cuentas: await listarCuentasGmailParaEnvio(locals.usuario!) });
	} catch (error) {
		return respuestaErrorGmail(error);
	}
};
