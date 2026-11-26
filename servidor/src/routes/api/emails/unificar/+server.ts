import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import { usuarioDePeticion } from '#lib/server/autenticacion/usuario.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/emails/unificar
 * Body: { servicioId }
 *
 * Pasa todos los mails activos del servicio a COMPARTIDO. No se pierden
 * direcciones, pero sí la clasificación anterior.
 */
export const POST: RequestHandler = async ({ request }) => {
	const cuerpo = await request.json().catch(() => null);
	const servicioId = Number(cuerpo?.servicioId);
	if (!Number.isInteger(servicioId) || servicioId <= 0) {
		return json({ error: 'servicioId inválido' }, { status: 400 });
	}
	try {
		const resultado = await emailsServicioRepositorio.unificarEmailsServicio(
			servicioId,
			await usuarioDePeticion(request, cuerpo?.usuario)
		);
		return json(resultado);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo unificar' }, { status: 400 });
	}
};
