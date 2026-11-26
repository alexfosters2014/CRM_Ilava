import { json } from '@sveltejs/kit';
import { actualizarPromesa } from '#lib/server/repositorios/seguimientos.ts';
import { actualizarPromesaSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** PATCH /api/seguimientos/[id]/promesas/[promesaId] — resultado manual auditado. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		const promesaId = Number(params.promesaId);
		if (
			!Number.isInteger(id) ||
			id <= 0 ||
			!Number.isInteger(promesaId) ||
			promesaId <= 0
		) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = actualizarPromesaSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await actualizarPromesa(locals.usuario!, id, promesaId, validacion.data);
		return json({ ok: true, seguimiento });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
