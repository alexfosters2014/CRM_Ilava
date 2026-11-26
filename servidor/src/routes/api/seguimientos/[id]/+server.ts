import { json } from '@sveltejs/kit';
import {
	ErrorSeguimientos,
	actualizarSeguimiento,
	obtenerSeguimiento
} from '#lib/server/repositorios/seguimientos.ts';
import { actualizarSeguimientoSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

function idDeParams(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		throw new ErrorSeguimientos('DATOS_INVALIDOS', 'El identificador del seguimiento no es válido');
	}
	return id;
}

/** GET /api/seguimientos/[id] */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		return json({ seguimiento: await obtenerSeguimiento(locals.usuario!, idDeParams(params)) });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};

/**
 * PATCH /api/seguimientos/[id]
 *
 * Estado, prioridad, responsable, título, observadores y cierre. Incluye
 * `version` para concurrencia optimista.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const cuerpo = await leerCuerpo(request);
		const validacion = actualizarSeguimientoSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await actualizarSeguimiento(
			locals.usuario!,
			idDeParams(params),
			validacion.data
		);
		return json({ ok: true, seguimiento });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
