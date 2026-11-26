import { json } from '@sveltejs/kit';
import { registrarAvance } from '#lib/server/repositorios/seguimientos.ts';
import { registrarAvanceSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/[id]/eventos
 *
 * Registra un avance de cualquier canal (nota, correo, WhatsApp manual,
 * llamada, reunión u otro) en la línea de tiempo del caso. El correo y el
 * WhatsApp se REGISTRAN: la aplicación no envía ni verifica entrega.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = registrarAvanceSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await registrarAvance(locals.usuario!, id, validacion.data);
		return json({ ok: true, seguimiento }, { status: 201 });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
