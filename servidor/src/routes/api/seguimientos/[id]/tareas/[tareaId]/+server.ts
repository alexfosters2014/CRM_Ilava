import { json } from '@sveltejs/kit';
import { actualizarTarea } from '#lib/server/repositorios/seguimientos.ts';
import { actualizarTareaSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** PATCH /api/seguimientos/[id]/tareas/[tareaId] — completar, reprogramar, cancelar o transferir. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		const tareaId = Number(params.tareaId);
		if (
			!Number.isInteger(id) ||
			id <= 0 ||
			!Number.isInteger(tareaId) ||
			tareaId <= 0
		) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = actualizarTareaSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await actualizarTarea(locals.usuario!, id, tareaId, validacion.data);
		return json({ ok: true, seguimiento });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
