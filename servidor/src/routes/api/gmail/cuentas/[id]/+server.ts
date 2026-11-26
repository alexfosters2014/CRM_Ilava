import { json } from '@sveltejs/kit';
import { desconectarCuentaGmail } from '#lib/server/repositorios/gmail.ts';
import { respuestaErrorGmail } from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/** DELETE /api/gmail/cuentas/[id] — desconecta sin borrar el histórico. */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		return json({ ok: await desconectarCuentaGmail(id) });
	} catch (error) {
		return respuestaErrorGmail(error);
	}
};
