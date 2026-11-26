import { json } from '@sveltejs/kit';
import { crearTicketVinculado } from '#lib/server/repositorios/seguimientos.ts';
import { crearTicketSeguimientoSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/seguimientos/[id]/tickets
 *
 * Crea un ticket transversal vinculado. El ticket conserva su módulo,
 * conversación y estados; acá solo queda la referencia y el bloqueo.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = crearTicketSeguimientoSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const ticket = await crearTicketVinculado(locals.usuario!, id, validacion.data);
		return json({ ok: true, ...ticket }, { status: 201 });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
