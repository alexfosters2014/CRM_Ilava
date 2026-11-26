import { json } from '@sveltejs/kit';
import { iniciarWhatsApp, vistaSesionWhatsApp } from '#lib/server/whatsapp/gestor.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/seguimientos/whatsapp/estado
 *
 * Estado resumido de la sesión para operadores de seguimientos (no expone el
 * QR ni permite administrarla; eso vive en Configuración y es solo ADMIN).
 */
export const GET: RequestHandler = async () => {
	await iniciarWhatsApp();
	const vista = vistaSesionWhatsApp();
	return json({
		conectado: vista.conectado,
		estado: vista.estado,
		numeroTelefono: vista.numeroTelefono
	});
};
