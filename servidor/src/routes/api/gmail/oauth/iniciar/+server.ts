import { isRedirect, redirect } from '@sveltejs/kit';
import { urlInicioOAuth } from '#lib/server/repositorios/gmail.ts';
import { respuestaErrorGmail } from '#lib/server/http/gmail.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/gmail/oauth/iniciar
 *
 * Redirige al consentimiento de Google. El estado va firmado con el usuario de
 * la sesión y vence en 10 minutos.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		throw redirect(302, urlInicioOAuth(locals.usuario!.id), { external: true });
	} catch (error) {
		if (isRedirect(error)) throw error;
		return respuestaErrorGmail(error);
	}
};
