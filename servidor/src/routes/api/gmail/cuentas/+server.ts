import { json } from '@sveltejs/kit';
import { gmailDisponible, listarCuentasGmail, pubsubConfigurado } from '#lib/server/repositorios/gmail.ts';
import { respuestaErrorGmail } from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/** GET /api/gmail/cuentas — cuentas conectadas, sin tokens. */
export const GET: RequestHandler = async () => {
	try {
		return json({
			configurado: gmailDisponible(),
			tiempoReal: pubsubConfigurado(),
			cuentas: await listarCuentasGmail()
		});
	} catch (error) {
		return respuestaErrorGmail(error);
	}
};
