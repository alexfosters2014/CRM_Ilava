import { json } from '@sveltejs/kit';
import {
	ErrorSeguimientos,
	emailsDelServicio
} from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/seguimientos/servicios/[servicioId]/emails
 *
 * Mails activos registrados del servicio, para precargar los destinatarios del
 * correo automático del seguimiento.
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = Number(params.servicioId);
		if (!Number.isInteger(id) || id <= 0) {
			throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El identificador no es válido');
		}
		return json({ emails: await emailsDelServicio(id) });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
