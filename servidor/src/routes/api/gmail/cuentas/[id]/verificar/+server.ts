import { json } from '@sveltejs/kit';
import { verificarCuentaGmail } from '#lib/server/repositorios/gmail.ts';
import { respuestaErrorGmail } from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/** POST /api/gmail/cuentas/[id]/verificar */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const resultado = await verificarCuentaGmail(id);
		return json({ ...resultado, ok: resultado.ok });
	} catch (error) {
		return respuestaErrorGmail(error);
	}
};
