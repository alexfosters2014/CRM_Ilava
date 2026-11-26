import { json } from '@sveltejs/kit';
import { sincronizarTodasLasCuentasGmail } from '#lib/server/repositorios/gmail.ts';
import { respuestaErrorGmail } from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/** POST /api/gmail/sincronizar — pasada manual de todas las casillas activas. */
export const POST: RequestHandler = async () => {
	try {
		return json({ ok: true, resultados: await sincronizarTodasLasCuentasGmail() });
	} catch (error) {
		return respuestaErrorGmail(error);
	}
};
