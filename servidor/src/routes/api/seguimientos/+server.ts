import { json } from '@sveltejs/kit';
import { crearSeguimiento, listarSeguimientos } from '#lib/server/repositorios/seguimientos.ts';
import { crearSeguimientoSchema } from '#lib/server/validaciones/seguimientos.ts';
import {
	leerCuerpo,
	respuestaErrorSeguimientos,
	respuestaValidacion
} from '#lib/server/http/seguimientos.ts';
import type { RequestHandler } from './$types';

/**
 * GET  /api/seguimientos
 * POST /api/seguimientos
 *
 * El guard de hooks.server.ts exige sesión y la pantalla `seguimientos`.
 * El repositorio aplica las reglas de edición por área.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const servicioId = Number(url.searchParams.get('servicioId') ?? 0);
		const incluirCerrados = url.searchParams.get('cerrados') === '1';
		return json({
			seguimientos: await listarSeguimientos(locals.usuario!, {
				servicioId: servicioId > 0 ? servicioId : undefined,
				incluirCerrados
			})
		});
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const cuerpo = await leerCuerpo(request);
		const validacion = crearSeguimientoSchema.safeParse(cuerpo);
		if (!validacion.success) return respuestaValidacion(validacion.error);

		const seguimiento = await crearSeguimiento(locals.usuario!, validacion.data);
		return json({ ok: true, seguimiento }, { status: 201 });
	} catch (error) {
		return respuestaErrorSeguimientos(error);
	}
};
