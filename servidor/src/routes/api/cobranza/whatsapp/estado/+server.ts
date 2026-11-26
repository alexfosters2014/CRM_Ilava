import { json } from '@sveltejs/kit';
import { iniciarWhatsApp, vistaSesionWhatsApp } from '#lib/server/whatsapp/gestor.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/whatsapp/estado — estado para el modal de cobranza. */
export const GET: RequestHandler = async () => {
	await iniciarWhatsApp();
	const vista = vistaSesionWhatsApp();
	return json({
		conectado: vista.conectado,
		estado: vista.estado,
		numeroTelefono: vista.numeroTelefono
	});
};
