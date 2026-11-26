import { json } from '@sveltejs/kit';
import { desconectarWhatsApp } from '#lib/server/whatsapp/gestor.ts';
import type { RequestHandler } from './$types';

/**
 * POST /api/whatsapp/desconectar
 *
 * Body: { cerrarSesion?: boolean }
 * - false (default): apaga el socket y conserva las credenciales.
 * - true: desvincula el dispositivo y borra las credenciales (pide QR nuevo).
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const cuerpo = (await request
			.json()
			.catch(() => ({}))) as { cerrarSesion?: unknown };
		const cerrarSesion = cuerpo?.cerrarSesion === true;
		return json(await desconectarWhatsApp(cerrarSesion));
	} catch (error) {
		console.error('[whatsapp] error al desconectar:', error);
		return json({ error: 'No se pudo desconectar WhatsApp' }, { status: 500 });
	}
};
