import { json } from '@sveltejs/kit';
import { comprobantesDeServicio } from '#lib/server/repositorios/seguimientos.ts';
import { respuestaErrorSeguimientos } from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** GET /api/seguimientos/servicios/[servicioId]/comprobantes — cartera del servicio. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const servicioId = Number(params.servicioId);
		if (!Number.isInteger(servicioId) || servicioId <= 0) {
			return json({ error: 'Servicio inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		return json({ comprobantes: await comprobantesDeServicio(servicioId) });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
