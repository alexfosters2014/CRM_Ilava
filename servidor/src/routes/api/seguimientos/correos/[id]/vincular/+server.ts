import { json } from '@sveltejs/kit';
import { vincularCorreo } from '#lib/server/repositorios/seguimientos.ts';
import { vincularCorreoSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/correos/[id]/vincular
 *
 * Vinculación manual auditada de un correo que no pudo asociarse con certeza.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const correoId = Number(params.id);
		if (!Number.isInteger(correoId) || correoId <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = vincularCorreoSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await vincularCorreo(
			locals.usuario!,
			correoId,
			validacion.data.seguimientoId
		);
		return json({ ok: true, seguimiento });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
