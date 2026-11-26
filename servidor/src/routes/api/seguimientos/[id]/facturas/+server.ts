import { json } from '@sveltejs/kit';
import { agregarFacturas } from '#lib/server/repositorios/seguimientos.ts';
import { agregarFacturasSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/[id]/facturas
 *
 * Incorpora comprobantes del mismo servicio. Las facturas nuevas de la cartera
 * no entran solas: siempre son una acción explícita y quedan en el historial.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = agregarFacturasSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await agregarFacturas(
			locals.usuario!,
			id,
			validacion.data.comprobanteIds
		);
		return json({ ok: true, seguimiento }, { status: 201 });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
