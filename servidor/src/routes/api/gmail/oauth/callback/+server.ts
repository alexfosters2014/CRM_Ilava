import { isRedirect, redirect } from '@sveltejs/kit';
import { BETTER_AUTH_URL } from '$app/env/private';
import { conectarCuentaGmail, validarEstadoOAuth } from '#lib/server/repositorios/gmail.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/gmail/oauth/callback
 *
 * Google vuelve acá con `code` y `state`. Se valida la firma y que el usuario
 * del estado sea el de la sesión. Nunca se muestra el código ni los tokens.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const base = (BETTER_AUTH_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	const destino = (estado: string) => `${base}/configuracion?seccion=correo&gmail=${estado}`;
	const errorGoogle = url.searchParams.get('error');
	if (errorGoogle) throw redirect(303, destino('cancelado'), { external: true });

	try {
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		if (!code || !state) throw new Error('Google no devolvió el código de autorización');
		const usuarioId = validarEstadoOAuth(state);
		if (!locals.usuario || locals.usuario.id !== usuarioId) {
			throw new Error('La sesión cambió durante la autorización. Volvé a intentar.');
		}
		await conectarCuentaGmail(code, usuarioId);
		throw redirect(303, destino('ok'), { external: true });
	} catch (error) {
		if (isRedirect(error)) throw error;
		console.error('[gmail] error de OAuth:', error);
		throw redirect(303, destino('error'), { external: true });
	}
};
