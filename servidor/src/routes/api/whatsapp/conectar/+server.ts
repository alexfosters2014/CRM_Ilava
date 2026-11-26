import { json } from '@sveltejs/kit';
import { conectarWhatsApp } from '#lib/server/whatsapp/gestor.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/whatsapp/conectar
 *
 * Abre el socket. Si hay credenciales guardadas reconecta sin QR; si no,
 * empieza a emitir un QR nuevo para vincular el número.
 */
export const POST: RequestHandler = async () => {
	try {
		return json(await conectarWhatsApp());
	} catch (error) {
		console.error('[whatsapp] error al conectar:', error);
		return json(
			{ error: 'No se pudo iniciar la conexión de WhatsApp' },
			{ status: 500 }
		);
	}
};
