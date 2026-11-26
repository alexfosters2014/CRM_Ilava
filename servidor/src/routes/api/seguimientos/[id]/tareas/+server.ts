import { json } from '@sveltejs/kit';
import { crearTarea } from '#lib/server/repositorios/seguimientos.ts';
import { crearTareaSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/** POST /api/seguimientos/[id]/tareas — próxima gestión programada. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Identificador inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 });
		}
		const cuerpo = await leerCuerpo(request);
		const validacion = crearTareaSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await crearTarea(locals.usuario!, id, validacion.data);
		return json({ ok: true, seguimiento }, { status: 201 });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
