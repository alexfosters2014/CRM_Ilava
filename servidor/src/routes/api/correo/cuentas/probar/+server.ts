import { json } from '@sveltejs/kit';
import { correoRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/correo/cuentas/probar
 * Body: { destino, cuentaId, aliasId? }
 * Envía un correo de prueba y devuelve el error SMTP real si falla.
 */
export const POST: RequestHandler = async ({ request }) => {
	let cuerpo: any;
	try {
		cuerpo = await request.json();
	} catch {
		return json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
	}
	try {
		const resultado = await correoRepositorio.probarCuentaCorreo({
			destino: cuerpo?.destino ?? '',
			cuentaId: Number(cuerpo?.cuentaId) || undefined,
			aliasId: Number(cuerpo?.aliasId) || undefined
		});
		return json(resultado);
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'No se pudo enviar la prueba' },
			{ status: 400 }
		);
	}
};
