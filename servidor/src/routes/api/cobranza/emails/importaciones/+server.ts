import { json } from '@sveltejs/kit';
import { emailsServicioRepositorio } from '#lib/server/repositorios/index.ts';
import type { RequestHandler } from './$types';

/** GET /api/cobranza/emails/importaciones — últimas planillas importadas. */
export const GET: RequestHandler = async () => {
	return json({ importaciones: await emailsServicioRepositorio.listarImportacionesEmails() });
};
