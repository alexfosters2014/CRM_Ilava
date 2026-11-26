import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/cobranza/emails/planilla
 *
 * Servicios vivos con sus mails activos de cobranza, listos para descargar la
 * planilla de importación.
 */
export const GET: RequestHandler = async () => {
	return json({ servicios: await emailsServicioRepositorio.listarPlanillaEmails() });
};
