import { json } from '@sveltejs/kit';
import { retirarFactura } from '#lib/server/repositorios/seguimientos.ts';
import { retirarFacturaSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/[id]/facturas/[facturaId]/retirar
 *
 * El retiro es lógico y exige motivo: nunca se borra el historial.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		const facturaId = Number(params.facturaId);
		if (
			!Number.isInteger(id) ||
			id <= 0 ||
			!Number.isInteger(facturaId) ||
			facturaId <= 0
		) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = retirarFacturaSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await retirarFactura(
			locals.usuario!,
			id,
			facturaId,
			validacion.data.motivo
		);
		return json({ ok: true, seguimiento });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
