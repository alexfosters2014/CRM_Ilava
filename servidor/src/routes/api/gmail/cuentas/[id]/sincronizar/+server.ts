import { json } from '@sveltejs/kit';
import { sincronizarCuentaGmail } from '#lib/server/repositorios/gmail.ts';
import { respuestaErrorGmail } from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/** POST /api/gmail/cuentas/[id]/sincronizar — fuerza una pasada de esa casilla. */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		return json({ ok: true, resultado: await sincronizarCuentaGmail(id) });
	} catch (error) {
		return respuestaErrorGmail(error);
	}
};
