import { json } from '@sveltejs/kit';
import { iniciarWhatsApp, vistaSesionWhatsApp } from '#lib/server/whatsapp/gestor.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/whatsapp/estado
 *
 * Estado de la sesión única y, si corresponde, el QR vigente como data URL.
 * El QR no se devuelve cuando la sesión ya está conectada.
 */
export const GET: RequestHandler = async () => {
	await iniciarWhatsApp();
	return json(vistaSesionWhatsApp());
};
